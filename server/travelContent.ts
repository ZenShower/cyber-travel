import type { PhotoShot } from './store.js';

export const travelNarrativeRules = `呈现层的口吻：你正在写旅行者身在当地的记录。所有会出现在朋友圈、路线、事件回响和相册中的文字，都从旅行者或同行者的视角自然叙述。系统的加速方式、AI创作机制、资料核验过程不属于他们的经历；不要写“模拟入馆”“本次模拟中”“模拟插曲”“赛博日不绑定现实日期”“此为虚构偶遇”“不是现场报告”等旁白。查询得到的地点、季节、交通和开放规则约束行程；当天的个人遭遇属于旅行故事，直接写发生了什么和怎样应对，不逐句追加创作免责声明。不假冒现实预订、联系或操作工具的成功，尚未落实的安排自然写“还没订好”“打算明天问问”。sourceUrl保留查阅的真实资料；未知位置和班次仍不可杜撰。`;

export const photoCompositionRules = `先根据这一站真正做的事选择photoScene：scenic是以海岸、山地、沙丘、村落全貌、徒步沿途等可观察空间为主要体验；daily是吃饭、交通、住处休整、室内参观等日常经历；mixed是两者都有。kind表示拍摄意图：candid是临时举机的生活记录；landscape是主动停下、寻找机位和构图的摄影作品，建筑、室内光影与材质也可以有摄影性。不能只因为没有人就标landscape，也不能每站默认三张随拍配一张入口照片。
scenic四图组至少两张landscape，九图组至少四张；在确有不同机位、空间或光线时可更多。它们分别交代环境尺度、主地形的线条、光与材质，不做同一景色的几个微小裁切；剩下的照片可以记录同行者和路上细节。daily组可以全是candid，不为了凑类型拍一个建筑入口；mixed组按实际内容自然混合。不按固定顺序、固定比例排整趟旅程，参考recentPhotoChoices避免连续重复。
为landscape主动设计摄影决定：可达的机位与高度、观看距离、画面主形状或阅读路径、前中远景的尺度关系、真实光源、当地材质带来的颜色。景色丰富的节点至少有一张能看懂环境尺度的照片；不要将每张都压成门口、脚边、车窗遮挡或大片平坦草地。日记应简短带到真正看到的空间和时刻，让摄影有经历依据；不要求把每个构图写进日记。根据已有季节、天气和时段组织画面，阴天也可以有明暗、颜色和层次，不能一律套灰调；不为大片编造日落、极光、雪山或不可达机位。`;

// Repair administrative wording only; real activities such as flight simulators remain valid.
export function cleanNarrativeText(text: string): string {
  return text
    .replace(/该情节是模拟中的日常障碍，不是已查证的现场作业报告。/g, '')
    .replace(/此为模拟偶遇，不是查证的现场记录。/g, '')
    .replace(/大包不得进入展区及寄存设施有馆方资料支持；忘取午饭是本次模拟插曲。/g, '')
    .replace(/本次模拟中[，,]?/g, '')
    .replace(/模拟中(?:的|[，,])?/g, '')
    .replace(/模拟入馆时/g, '入馆时')
    .replace(/模拟返程中/g, '返程途中')
    .replace(/模拟出发前/g, '出发前')
    .replace(/模拟返屋途中/g, '回住处的路上')
    .replace(/本次模拟/g, '这次行程')
    .replace(/模拟(?=的|日期|星期|周[一二三四五六日天]|工作日|开放|回程|乘车|乘\d|采用|返航|天气)/g, '')
    .replace(/的模拟(?=[，。；])/g, '的安排')
    .replace(/工作日模拟/g, '工作日安排')
    .replace(/进行模拟/g, '安排行程')
    .replace(/条件模拟/g, '条件安排')
    .replace(/(?:是|为)模拟叙事，不当作实时天气报告/g, '发生在这段路上')
    .replace(/[^。；]*?(?:均为|属于|为)模拟(?:情节|叙事)[^。；]*[。；]?/g, '')
    .replace(/的模拟条件/g, '的条件')
    .replace(/班次模拟/g, '班次')
    .replace(/是[^。；]*模拟插曲[。；]?/g, '')
    .trim();
}

export function validatePlanReferences(plannedIds: Set<string>, result: { visitedPlanLegId: string | null; skippedPlanLegId: string | null; skipReason: string | null; event: string | null; consequence: string | null }): void {
  if (result.visitedPlanLegId && !plannedIds.has(result.visitedPlanLegId)) throw new Error('visitedPlanLegId只能填写presentPlan中状态为planned的原始id，不能引用已完成的计划');
  if (result.skippedPlanLegId && (!plannedIds.has(result.skippedPlanLegId) || !result.skipReason?.trim() || !result.event || !result.consequence || result.skippedPlanLegId === result.visitedPlanLegId)) throw new Error('skippedPlanLegId只能填写仍为planned的原始id，且必须有本次event、consequence和skipReason；普通返程不跳过计划，请全部填null');
  if (!result.skippedPlanLegId && result.skipReason) throw new Error('没有跳过计划时skipReason必须为null');
}

const storyKeys = new Set(['title', 'diary', 'activity', 'transport', 'stay', 'event', 'consequence', 'trigger', 'pending', 'effect', 'remaining', 'change', 'relationship', 'whereabouts', 'caption', 'why', 'localBasis', 'accessNotes', 'resolutionNote', 'planningNotes', 'bookTitle', 'bookClosing', 'closing']);
export function cleanStoryFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => cleanStoryFields(item)) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item === 'string' && storyKeys.has(key) ? cleanNarrativeText(item) : cleanStoryFields(item),
  ])) as T;
}

export function validatePhotoComposition(scene: 'scenic' | 'daily' | 'mixed', shots: PhotoShot[]): void {
  if (![4, 9].includes(shots.length)) throw new Error('这一站的照片必须组成四宫格或九宫格');
  if (scene === 'scenic' && shots.filter(shot => shot.kind === 'landscape').length < (shots.length === 4 ? 2 : 4)) {
    throw new Error('以景色为主的节点没有安排足够的独立风光摄影镜头');
  }
}
