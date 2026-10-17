import { createHash } from 'node:crypto';
import { cleanStoryFields, photoCompositionRules, travelNarrativeRules, validatePhotoComposition, validatePlanReferences } from './travelContent.js';
import { createTravelThread } from './codexRuntime.js';
import { skillsRoot, generatedImagesRoot } from './config.js';
import { z } from 'zod';
import { consumeAgentEvents } from './agentStream.js';
import type { ProgressReporter } from '../src/activityTypes.js';
import type { ContinuityUpdate, Photo, PlanLeg, Point, Spot, Trip } from './store.js';

// The CLI can retry a timed-out WebSocket before falling back to HTTP.
// Leave enough time for that recovery and the actual planning/image work.
const AGENT_TIMEOUT_MS = 600000;
const PHOTO_TIMEOUT_MS = 900000;
const pointSchema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), label: z.string().min(1) });
const sourceUrlSchema = z.string().refine(value => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}, '地点资料必须使用 HTTPS 链接').nullable();
const legSchema = z.object({ title: z.string(), place: pointSchema, transport: z.string(), activity: z.string(), why: z.string(), localBasis: z.string(), accessNotes: z.string(), sourceUrl: sourceUrlSchema });
const planSchema = z.object({ legs: z.array(legSchema).min(2).max(8) });
const continuityUpdateSchema = z.object({ threadId: z.string(), effect: z.string().min(8), remaining: z.string().min(8).nullable() });
const companionChangeSchema = z.object({ id: z.string().nullable(), name: z.string().min(1), travelingTogether: z.boolean(), relationship: z.string().min(2), whereabouts: z.string().min(2), change: z.string().min(8), appearance: z.string().nullable() });
const photoBriefSchema = z.object({ moment: z.string().min(8), photographer: z.string().min(8), framing: z.string().min(8) });
const stepSchema = z.object({ place: pointSchema, title: z.string(), diary: z.string().min(80), activity: z.string(), transport: z.string(), movement: z.object({ mode: z.string().min(1), durationMinutes: z.number().int().positive().nullable(), basis: z.string().nullable() }), stay: z.string(), people: z.array(z.string()), companionChanges: z.array(companionChangeSchema), event: z.string().nullable(), consequence: z.string().nullable(), sourceUrl: sourceUrlSchema, photoScene: z.enum(['scenic', 'daily', 'mixed']), photoShots: z.array(z.object({ kind: z.enum(['candid', 'landscape']), caption: z.string().min(2), brief: photoBriefSchema })).min(4).max(9), visitedPlanLegId: z.string().nullable(), skippedPlanLegId: z.string().nullable(), skipReason: z.string().nullable(), rewritePlan: z.boolean(), extendPlan: z.boolean(), branchReason: z.string().nullable(), branchSourceThreadId: z.string().nullable(), newPlan: z.array(legSchema).max(8), continuityUpdates: z.array(continuityUpdateSchema), newOpenConsequence: z.string().min(8).nullable() });
const bookSchema = z.object({ title: z.string(), closing: z.string() });

const agentThread = createTravelThread;
async function runJson<T extends z.ZodTypeAny>(prompt: string, schema: T, timeoutMs = AGENT_TIMEOUT_MS, report?: ProgressReporter, validate?: (value: z.infer<T>) => void): Promise<z.infer<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const thread = agentThread();
    let nextPrompt = prompt;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const turn = await thread.runStreamed(nextPrompt, { signal: controller.signal, outputSchema: z.toJSONSchema(schema) });
      const finalResponse = await consumeAgentEvents(turn.events, report);
      try {
        const value = cleanStoryFields(schema.parse(JSON.parse(finalResponse)));
        validate?.(value);
        return value;
      } catch (error) {
        if (attempt === 1) throw error;
        report?.('正在核对行程引用与镜头安排，修正本次结果');
        nextPrompt = `上一次结果尚未发布，校验发现：${error instanceof Error ? error.message : String(error)}。请只修正这一检查点的完整JSON，承接原来的当前状态、人物和经历，不推进到另一个节点，不重复执行新的旅程。${travelNarrativeRules}`;
      }
    }
    throw new Error('未得到可保存的旅行结果');
  } finally {
    clearTimeout(timer);
  }
}
const formatPoint = (point: Point) => `${point.label} (${point.lat.toFixed(5)}, ${point.lon.toFixed(5)})`;
const numberedPlanTitle = (title: string, index: number) => `${String(index + 1).padStart(2, '0')} · ${title.replace(/^(?:\s*\d{1,2}\s*[·.、-]\s*)+/, '').trim()}`;
const localDiscoveryRules = `规划前先检索目的地及周边真实地理和地点资料，优先考虑当地可靠资料、地图、活动组织或实际到访记录。不要把行程写成知名景点清单；主动寻找可以抵达、但未必是成熟景区的风景、日常空间、地方文化和真实活动。结合地貌、气候、季节、当天可行交通与既有旅程状态，在步行、徒步、当地活动、文化体验、水上或山地活动等方式里自然选择，不按固定菜单硬凑。阿式攀登、潜水、探洞、滑雪等专业活动只在当地确实适合、季节与技能装备允许且必要向导或许可可落实时安排；否则可以改为更合理的观察、短线体验或其他去处。每段路线要有不同的观看距离或体验方式，但不为求多样性而瞎编。具体小地点必须能找到真实依据，sourceUrl 填实际查阅的 HTTPS 资料链接；若无法核实，只写可确认的地区层级活动，sourceUrl 为 null，坐标使用可确认的地区或城市位置，不创造景点名称、精确坐标或活动主办方。`;

export async function planJourney(trip: Trip, report?: ProgressReporter): Promise<PlanLeg[]> {
  const result = await runJson(`你是一个真实世界的自主旅行规划师。为一位从工位出发的赛博旅行分身制定第一版可改写的旅行方向。目的地：${formatPoint(trip.destination)}。这是地图上选中的准确落点；如果它偏远、没有住宿或交通，先说明最近可达入口，再安排真实可行的进入方式，不假设落点本身有旅馆或公路。${localDiscoveryRules}${travelNarrativeRules}形成未来约 5–8 个赛博日的初版长程方向，列出 3–6 个地理上有区分、交通上能衔接的区域或停靠点；不要把同一城市内步行可达的街道、公园和建筑拆成整份初始计划。先处理出发点附近的合理入口，再结合当地尺度逐步走向不同岛屿、城镇或地貌；孤立地区则尊重可达范围，不强行跨区。选中坐标即使对应某家企业或私人住宅，也只作地理起点，不把它当成旅行主角；城市内的细微发现留给每日节点。地点经纬度必须与真实位置相符。每段给出 activity、localBasis、accessNotes 与 sourceUrl；why 解释叙事上的吸引力。行程只是暂定方向，以后会被意外改写。保持旅行感、探索感与现实因果。只输出结构化 JSON。`, planSchema, AGENT_TIMEOUT_MS, report);
  return result.legs.map((leg, index) => ({ ...leg, id: crypto.randomUUID(), status: 'planned' as const, introducedDay: 1, title: numberedPlanTitle(leg.title, index) }));
}

export async function advanceJourney(trip: Trip, options: { eventCue?: boolean; report?: ProgressReporter } = {}): Promise<{ spot: Spot; newPlan: PlanLeg[] | null; planChange: 'extend' | 'rewrite' | undefined; photoKinds: Array<'candid' | 'landscape'>; visitedPlanLegId: string | null; skippedPlanLegId: string | null; skipReason: string | null; continuityUpdates: ContinuityUpdate[]; newOpenConsequence: string | null }> {
  const quietStreak = [...trip.spots].reverse().findIndex(spot => Boolean(spot.event));
  const daysWithoutEvent = quietStreak < 0 ? trip.spots.length : quietStreak;
  const eventCue = options.eventCue ?? Math.random() < Math.min(0.75, 0.3 + daysWithoutEvent * 0.07);
  const compact = {
    destination: trip.destination,
    day: trip.currentDay,
    presentPlan: trip.plan,
    priorSpots: trip.spots.map(s => ({ place: s.place, title: s.title, activity: s.activity, event: s.event, consequence: s.consequence, branchReason: s.branchReason, people: s.people, stay: s.stay, day: s.day })).slice(-12),
    planRevision: trip.planRevision,
    recentPhotoChoices: trip.spots.slice(-4).map(spot => ({ activity: spot.activity, scene: spot.photoScene, shots: spot.photos.map(photo => ({ kind: photo.kind, caption: photo.caption })) })),
    isFirstSpot: trip.spots.length === 0,
    simulatedHoursSinceLastRecord: trip.spots.length === 0 ? null : trip.pace === 'event' ? 12 : Math.max(0, (Date.now() - new Date(trip.spots.at(-1)!.happenedAt).getTime()) / 3600000 * 24),
    randomEventCue: eventCue,
    openConsequences: (trip.consequenceThreads || []).filter(thread => thread.status === 'open').map(({ id, originDay, trigger, pending }) => ({ id, originDay, trigger, pending })),
    companions: (trip.companions || []).map(({ id, name, source, appearance, travelingTogether, relationship, whereabouts, firstDay, lastDay, history }) => ({ id, name, source, appearance, travelingTogether, relationship, whereabouts, firstDay, lastDay, recentHistory: history.slice(-3) })),
  };
  const clockDescription = trip.pace === 'event' ? '这次为加速旅行测试：上一站的日记和照片完成后继续下一站的行程，每天记录两处，相邻节点约相隔半个赛博日；当前 day 已按节点数计算，不按现实耗时计算。' : '1 个现实小时相当于赛博世界 1 天，检查机会约每现实 10 分钟一次，但每天最多记录两处。';
  const result = await runJson(`你是旅行分身的自主叙事代理。现在来到一个值得留下记录的检查点；${clockDescription}${travelNarrativeRules}当前状态：${JSON.stringify(compact)}。若 isFirstSpot=true，这一站应覆盖抵达后真正开始探索的过程；城市里的普通道路或私人建筑只是地理起点，不要把原地辨认路口写成整站。安全进入附近可达的公共空间，完成一件具体的旅行行动；只有偏远落点、交通或天气确实阻碍进入时，才把进城过程本身作为主要经历。如电脑休眠导致跳过了多次记录，请在这次日记里自然交代中间的移动，不凭空瞬移。遵循真实地理、当地季节、活动条件与交通可行性。不要只在耳熟能详的地名之间移动；回看已做过的活动，寻找真实但不一定成熟的当地去处与见闻，让停靠点有多种尺度、活动与节奏。特别检查最近三站是否重复以步行看风景为主；如果重复，本次应优先核实并体验另一种当地生活或活动，不把又一条步道当作唯一主角。${localDiscoveryRules}如果沿用已核实的计划地点，可承接它的资料；新增具体地点要重新核实并填 sourceUrl。只有当这次实际完成了 presentPlan 中某一条 planned 计划的主要停留或活动，visitedPlanLegId 才填写该条计划的 id；只是路过附近、到达邻近地点或原活动被取消都不算完成。一次最多确认一条，其他情况填 null。如果原计划的主要活动因未预约、停运、关门、天气或偶遇而没做成，不可当作平静完成：event 写实际障碍，consequence 写改成了什么行动。若已决定离开或不再尝试该计划，skippedPlanLegId 填这条 planned 计划的 id，skipReason 写具体原因；只是在当地推迟、之后仍会尝试，则 skippedPlanLegId 和 skipReason 都填 null，保留它为 planned。一次最多跳过一条，不得与 visitedPlanLegId 相同。没有跳过时两项都为 null。openConsequences 是之前事件尚未兑现完的后果：每条都必须在 continuityUpdates 中按 threadId 更新，effect 写本次具体改变了什么行动、选择、关系或时间；若暂时无法兑现，写明今天为什么推迟与下一次可兑现的条件，不得复制旧描述。remaining 填仍待发生的具体影响；已落实则填 null。diary、交通、住宿和计划须与这些更新相符。新事件若留下后续影响，newOpenConsequence 写下一站开始需要面对的具体事项；仅当后果在本次完全结清时填 null。companions 是持续存在的人物账本：uploaded 是出发前通过照片带入的人，encounter 是旅途中认识的人。travelingTogether 只表示当下是否同行，不是永久绑定；可以暂别、重逢、独行，关系和去向需与前文一致。companionChanges 只记录本次确实发生变化的人：已有旅伴用原 id，新认识且会延续故事的人用 id=null，写名字、可观察的外貌（新人物）、关系、去向、是否同行及具体变化；普通一面之缘只写 people，不必建档。人数和关系走向不设事件菜单，不强迫每站都出现新人物。允许可信的亲密、暧昧、争执、依赖、背叛或成年人之间复杂但不露骨的关系，须符合人物意愿与已发生的事，不把每次相遇都推向爱情。重要关系变化要影响接下来的照片、日记、选择或路线，并可写入 newOpenConsequence 延续。people 只列这一站实际同场的人，未同行的人可以只出现在记忆或消息中。randomEventCue 是独立抽取的叙事信号，不是固定事件菜单：为 true 时，本次应让当前环境、交通、活动或遇到的人自然产生一个可信的偶遇、麻烦或机会，event 与 consequence 都要具体，后果至少改变当下行动、人与人的关系或下一站；为 false 时仍可因场景自然出现事件，也可以平静。冒险感较高，但不要离谱、神奇或危险猎奇。若今天的新事件或以前留下的 openConsequences 让尚未完成的计划不再成立，rewritePlan=true、extendPlan=false，给出不同的新计划和明确的 branchReason。若是今天的新事件触发，branchSourceThreadId=null，newOpenConsequence 必须写下一站要面对的事项；若是以前的后果今天才迫使改路，branchSourceThreadId 填对应 threadId，并在 continuityUpdates 具体说明改路行动，此时可没有新事件，原有后果可继续或结清。不改路时 branchSourceThreadId=null。计划走完后新增方向只能用 extendPlan，不算改路。无论是否有事件，若当前计划已经走完或即将走完而旅程仍继续，且未因事件改路，则 extendPlan=true，查证并添加未来 3–6 天的新方向；这是自然续程，不标成意外分支，不淘汰已走过的计划。其余情况 extendPlan=false。rewritePlan 与 extendPlan 不可同时为 true；两者皆 false 时 newPlan 为空。所有新计划遵守地点核实和活动多样性原则。diary 用第一人称写 80 到 180 字，像旅行者当天自己写下的一条朋友圈：从刚发生的小动作、物件、天气或一句真实的对话写起，句子长短自然，可以平静、尴尬、无聊或轻微失落；允许留白和没有结论。用克制的日常细节、轻微的疏离感与言外之意，不模仿任何作家的原句或标志性表达。别用“这让我意识到”“原来旅行就是”“仿佛时间静止”“治愈”“松弛感”等总结和套话，不为拔高主题而编造感悟。title 像本人随手写的短标题，不要宣传语。${photoCompositionRules}photoShots 设计 4 张或 9 张照片：一般时刻用 4 张，经历丰富、场景确实多样的节点才用 9 张。每张都有 kind、caption 和独立 brief：moment（哪一秒）、photographer（谁从哪里拍、为何举机）、framing（具体画面锚点与空间取舍）。照片应形成一个有起承转合的视觉组照，可以穿插人物、路上细节、食物、住处、远景、偶遇与事件后果，但每张都必须有日记支持，不能为了凑九宫格虚构情节。连续照片不能只是相同场景换角度。candid 要像生活中被动作或细节吸引后随手拍到，不能默认让旅行者停下来回头微笑；若人物入镜，允许背影、手部、动作中或局部遮挡，仍须维持参考照特征。landscape 要有可达机位、真实前中远关系和克制光色。movement 只描述上一站到这一站的实际移动，mode 填主要交通方式，durationMinutes 仅在有实际依据或日记明确交代时给出合理耗时，否则 null；basis 写时长依据或 null。不要把无关人或未记录的情节塞进照片。分身外貌由上传照片约束，不自行编造身份性格。只输出结构化 JSON。`, stepSchema, AGENT_TIMEOUT_MS, options.report, result => {
    validatePhotoComposition(result.photoScene, result.photoShots);
    validatePlanReferences(new Set(trip.plan.filter(leg => leg.status === 'planned').map(leg => leg.id)), result);
  });
  if (result.rewritePlan && result.extendPlan) throw new Error('代理同时要求改路和续程');
  if ((result.rewritePlan || result.extendPlan) && result.newPlan.length === 0) throw new Error('代理提出改路或续程，但未给出新计划');
  if (eventCue && !result.event) throw new Error('本次事件信号已触发，但代理没有留下实际事件');
  if (result.event && !result.consequence) throw new Error('事件缺少后果');
  if (!result.event && result.newOpenConsequence) throw new Error('没有事件却创建了待延续后果');
  const openIds = (trip.consequenceThreads || []).filter(thread => thread.status === 'open').map(thread => thread.id);
  const branchFromEarlier = result.branchSourceThreadId && openIds.includes(result.branchSourceThreadId) && result.continuityUpdates.some(update => update.threadId === result.branchSourceThreadId);
  if (!result.rewritePlan && result.branchSourceThreadId) throw new Error('没有改路却引用了分支来源');
  if (result.branchSourceThreadId && !branchFromEarlier) throw new Error('改路引用了不存在或未承接的旧事件');
  if (result.rewritePlan && (!result.branchReason || !trip.plan.some(leg => leg.status === 'planned') || (!result.event && !branchFromEarlier))) throw new Error('改路必须由当前或此前尚未结清的事件触发');
  if (result.rewritePlan && result.event && !result.newOpenConsequence && !branchFromEarlier) throw new Error('当日事件改路必须留下待兑现的后果');
  if (result.continuityUpdates.length !== openIds.length || new Set(result.continuityUpdates.map(update => update.threadId)).size !== openIds.length || result.continuityUpdates.some(update => !openIds.includes(update.threadId))) throw new Error('代理没有逐条处理此前尚未兑现的后果');
  if (result.skippedPlanLegId && (!result.skipReason || !result.event || !result.consequence || result.skippedPlanLegId === result.visitedPlanLegId || !trip.plan.some(leg => leg.id === result.skippedPlanLegId && leg.status === 'planned'))) throw new Error('跳过计划缺少意外、后果或有效计划 ID');
  if (!result.skippedPlanLegId && result.skipReason) throw new Error('填写了跳过原因却没有计划 ID');
  validatePhotoComposition(result.photoScene, result.photoShots);
  if (new Set(result.photoShots.map(shot => shot.brief.moment.trim())).size !== result.photoShots.length) throw new Error('组照中每张照片都需要独立的拍摄时刻');
  const existingCompanionIds = new Set((trip.companions || []).map(person => person.id));
  const changedIds = result.companionChanges.filter(change => change.id !== null).map(change => change.id);
  if (new Set(changedIds).size !== changedIds.length || changedIds.some(id => !existingCompanionIds.has(id!))) throw new Error('旅伴更新引用了不存在或重复的人物');
  const spot: Spot = {
    id: crypto.randomUUID(), day: trip.currentDay, happenedAt: new Date().toISOString(), place: result.place,
    title: result.title, diary: result.diary, activity: result.activity, transport: result.transport, movement: result.movement,
    stay: result.stay, people: result.people, companionChanges: result.companionChanges, event: result.event, consequence: result.consequence, sourceUrl: result.sourceUrl,
    photoScene: result.photoScene, photoDirection: result.photoShots.map(shot => shot.brief.moment).join('；'), photoShots: result.photoShots, photos: [],
    planRevision: trip.planRevision + (result.rewritePlan ? 1 : 0), branchReason: result.rewritePlan ? result.branchReason : null,
    branchSourceThreadId: result.rewritePlan ? result.branchSourceThreadId : null,
    continuityUpdates: result.continuityUpdates, eventCue,
  };
  const newPlan = result.rewritePlan || result.extendPlan ? result.newPlan.map((leg, index) => ({ ...leg, id: crypto.randomUUID(), status: 'planned' as const, introducedDay: trip.currentDay, title: numberedPlanTitle(leg.title, index) })) : null;
  return { spot, newPlan, planChange: result.extendPlan ? 'extend' : result.rewritePlan ? 'rewrite' : undefined, photoKinds: result.photoShots.map(shot => shot.kind), visitedPlanLegId: result.visitedPlanLegId, skippedPlanLegId: result.skippedPlanLegId, skipReason: result.skipReason, continuityUpdates: result.continuityUpdates, newOpenConsequence: result.newOpenConsequence };
}

export async function closeBook(trip: Trip, report?: ProgressReporter): Promise<{ title: string; closing: string }> {
  return runJson(`为这段旅行写相册封面标题和末页短文。${travelNarrativeRules}只基于真实留下的节点、人物和因果，不捏造新的事件。前事的回响要按记录写；若结束时仍有未兑现的后果，只能作为悬而未决的可能，不得写成已经发生。不要把它写成旅游广告。旅行记录：${JSON.stringify(trip.spots.map(({ place, title, diary, event, consequence, continuityUpdates }) => ({ place, title, diary, event, consequence, continuityUpdates })))}。计划与实际结果：${JSON.stringify(trip.plan.map(({ title, status, resolvedDay, resolutionNote }) => ({ title, status, resolvedDay, resolutionNote })))}。后果账本：${JSON.stringify(trip.consequenceThreads || [])}。人物账本：${JSON.stringify(trip.companions || [])}。文字像自己翻相册时的简短回想：具体、克制、有留白，不写宏大感悟、广告句或作家腔，不复制某位作家的表达。只输出 JSON。`, bookSchema, AGENT_TIMEOUT_MS, report);
}

export async function generateSpotPhoto(trip: Trip, spot: Spot, photo: Photo, report?: ProgressReporter): Promise<string> {
  const kind = photo.kind;
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const skillRoot = skillsRoot;
  const skillName = kind === 'candid' ? 'chill-snapshot' : 'links-photography';
  const skillDir = path.join(skillRoot, skillName);
  report?.(kind === 'candid' ? '生活随拍 · 正在读取 chill-snapshot 与人物参考' : '风光摄影 · 正在读取 links-photography 与摄影图谱');
  const skillText = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8').catch(() => null);
  if (!skillText) throw new Error(`未找到 ${skillName} 摄影规则，请运行 npm run doctor 检查安装`);
  const visualAtlas = kind === 'landscape' ? await fs.readFile(path.join(skillDir, 'references', 'reference-atlas.md'), 'utf8') : '';
  const boardPath = path.join(skillDir, 'assets', 'reference-board.jpg');
  const hasBoard = await fs.access(boardPath).then(() => true).catch(() => false);
  const thread = agentThread();
  const avatarPaths = trip.avatarUrls.map(url => path.resolve(process.cwd(), 'public', url.replace(/^\//, '')));
  const picturedCompanions = (trip.companions || []).filter(person => spot.people.includes(person.name) && person.referenceUrls.length);
  const companionPaths = picturedCompanions.flatMap(person => person.referenceUrls.slice(0, 2).map(url => path.resolve(process.cwd(), 'public', url.replace(/^\//, ''))));
  const imageInputs = kind === 'candid' ? [...avatarPaths.slice(0, 4), ...companionPaths].map(p => ({ type: 'local_image' as const, path: p })) : [];
  const companionVisuals = picturedCompanions.map(person => `${person.name} 的外貌参考照片在旅行者照片之后，参考张数 ${Math.min(2, person.referenceUrls.length)}`).join('；');
  const encounteredVisuals = (trip.companions || []).filter(person => person.source === 'encounter' && spot.people.includes(person.name) && person.appearance).map(person => `${person.name}：${person.appearance}`).join('；');
  const candidRules = `按本机 chill-snapshot 技能创作：拍摄者因眼前真实动作或细节才举机，不能把旅行者安排成站定回头、正对镜头微笑的标准旅行人像；只有日记明确自拍时才允许正视镜头。人物可在动作中、偏在画面一侧，或仅有背影和手部，场景仍是故事主角。构图随意但取舍有原因；曝光、失焦、噪点只在真实光线和动作需要时出现，不叠加假做旧。照片里的旅行者严格依据最先附带的 ${Math.min(4, avatarPaths.length)} 张上传的外貌参考照片，维持可见的脸部和体态特征。${companionVisuals || '本张没有上传照片的旅伴参考'}。途中认识、没有参考照片的人物要保持已记录的外貌：${encounteredVisuals || '无'}。已记录的同行或交谈对象：${spot.people.length ? spot.people.join('、') : '无'}；不要让日记未记录的路人成为显眼的第二主角。`;
  const landscapeRules = `按本机 links-photography 技能创作一张有明确摄影判断的作品。${hasBoard ? `生图前目视读取 ${boardPath}，` : '使用已提供的文字图谱，'}从图谱中挑选最适合现场的1—2项抽象关系，例如环境尺度、明暗重量、形状秩序或材质色彩；将这些决定明确写入实际image_gen提示词。图参仅用于摄影语言，不能照搬雪、山形、瀑布、人物服装或拼贴版式。
镜头位置、主形状、观看距离与阅读路径由本站brief决定；景色为主的节点让观众看懂地形尺度与空间关系，不把有潜力的景观一律变成脚边近景、门口打卡或随走随拍。有意识地等待已有天气与时段中能成立的光线，阴天保留真实层次与材质颜色，不强制低饱和灰调。以Hasselblad X2D数字中画幅的自然宽容度、细节质地和颜色分离为成像取向；光源、机位和当地地貌仍优先，不伪造相机EXIF。构图稳、有主次，颜色有具体物质来源，亮部连续、暗部保有重量；不加HDR光晕、统一滤镜、无因薄雾或超现实地貌。`;
  const groundingRules = spot.sourceUrl
    ? `地点资料：${spot.sourceUrl}。生图前核对实际地貌、建筑语汇和可辨识外观；资料若只证明活动存在，不当作精确机位的视觉依据。选择已有依据的环境、地形与材质关系组织照片；未确认的细部避开或弱化，不臆造标志建筑与山形。地方层级的空间有充分依据时可以拍环境尺度，不因某个细部未知就把每张都缩成遮挡近景。`
    : '此节点没有具体地点资料。先核实地区层级的地貌与建筑语汇；无法确认的精确外观不要臆造，改用可信的生活近景或非地标性风景。';
  const brief = photo.brief || spot.photoDirections?.[kind];
  const otherBrief = spot.photoShots?.find(shot => shot.brief.moment !== brief?.moment)?.brief || spot.photoDirections?.[kind === 'candid' ? 'landscape' : 'candid'];
  const direction = brief
    ? `只拍这一个时刻：${brief.moment}。拍摄者：${brief.photographer}。画面锚点与取舍：${brief.framing}。`
    : `镜头方向：${spot.photoDirection}。`;
  const separation = otherBrief ? `同一站另一张照片安排在「${otherBrief.moment}」；这张不能挪到那个时刻，也不能只做同一构图的有人／无人版本。` : '';
  const prompt = `调用你当前可用的内置 image_gen 生图工具，生成一张真实旅行照片。以下是本机 ${skillName} Skill 的原始制作要求，必须实际用于这张照片，而不是只借用名称：\n${skillText}\n${visualAtlas ? `摄影参考图谱文字：\n${visualAtlas}\n` : ''}本次具体任务：地点：${formatPoint(spot.place)}；当天经历：${spot.diary}；${direction}${separation}${groundingRules}类型：${kind === 'candid' ? candidRules : landscapeRules}。只生成这一组照中的一张，标题是「${photo.caption}」，与其他镜头的内容不同。没有文字或水印。生成后用一句话报告已完成。`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PHOTO_TIMEOUT_MS);
  try {
    const beganAt = Date.now();
    const turn = await thread.runStreamed([{ type: 'text', text: prompt }, ...imageInputs], { signal: controller.signal });
    await consumeAgentEvents(turn.events, report);
    report?.('正在查收与保存生成的照片');
    const after = await findGeneratedImages();
    const candidates = await Promise.all(after.filter(p => thread.id && p.includes(thread.id)).map(async p => ({ path: p, time: (await fs.stat(p)).mtimeMs })));
    const source = candidates.filter(item => item.time >= beganAt - 1000).sort((a, b) => b.time - a.time)[0]?.path;
    if (!source) throw new Error('Codex 会话未产出可读取的图片文件');
    const targetFolder = path.resolve(process.cwd(), 'public', 'media', trip.id);
    await fs.mkdir(targetFolder, { recursive: true });
    const fileName = `${spot.id}-${kind}-${crypto.randomUUID().slice(0, 8)}${path.extname(source) || '.png'}`;
    await fs.copyFile(source, path.join(targetFolder, fileName));
    const auditFolder = path.resolve(process.cwd(), 'data', 'photo-generations', trip.id);
    await fs.mkdir(auditFolder, { recursive: true });
    await fs.writeFile(path.join(auditFolder, `${photo.id || fileName}.json`), JSON.stringify({
      tripId: trip.id, spotId: spot.id, photoId: photo.id, kind, caption: photo.caption,
      skill: skillName, skillSha256: createHash('sha256').update(skillText).digest('hex'),
      atlasSha256: visualAtlas ? createHash('sha256').update(visualAtlas).digest('hex') : null,
      promptVersion: 'scene-photography-v2', codexThreadId: thread.id,
      generatedAt: new Date().toISOString(), url: `/media/${trip.id}/${fileName}`,
    }, null, 2));
    return `/media/${trip.id}/${fileName}`;
  } finally {
    clearTimeout(timer);
  }
}

async function findGeneratedImages(): Promise<string[]> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const root = generatedImagesRoot;
  const found: string[] = [];
  async function walk(folder: string, depth: number) {
    if (depth > 3) return;
    for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) found.push(full);
    }
  }
  await walk(root, 0);
  return found;
}
