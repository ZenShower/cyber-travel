import type { ActivityRegistry } from './activity.js';
import type { ProgressReporter } from '../src/activityTypes.js';
import type { ContinuityUpdate, Photo, PlanLeg, Spot, Trip } from './store.js';
import { canAdvanceEvent, choosePhotoKinds, choosePhotoShots, cyberDay, nextCheckpointAt, shouldRecordSpot } from './scheduler.js';

type AdvanceResult = {
  spot: Spot;
  newPlan: PlanLeg[] | null;
  planChange?: 'extend' | 'rewrite';
  photoKinds: Array<'candid' | 'landscape'>;
  visitedPlanLegId?: string | null;
  skippedPlanLegId?: string | null;
  skipReason?: string | null;
  continuityUpdates?: ContinuityUpdate[];
  newOpenConsequence?: string | null;
};

export type EngineDeps = {
  read: (id: string) => Trip | null;
  write: (trip: Trip) => void;
  plan: (trip: Trip, report?: ProgressReporter) => Promise<PlanLeg[]>;
  advance: (trip: Trip, report?: ProgressReporter) => Promise<AdvanceResult>;
  photo: (trip: Trip, spot: Spot, photo: Photo, report?: ProgressReporter) => Promise<string>;
  book: (trip: Trip, report?: ProgressReporter) => Promise<{ title: string; closing: string }>;
  activity?: ActivityRegistry;
  now?: () => number;
};

const MAX_PHOTO_ATTEMPTS = 3;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const failureNotice = (error: unknown, fallback: string) => {
  const message = errorMessage(error);
  if (/model.*not supported|unsupported.*model/i.test(message)) return '当前桥接模型不可用，请检查本地 Codex 配置后重试';
  if (/abort|timeout|timed out/i.test(message)) return '等待 Codex 超时，本次未完成，可以重试';
  if (/unauthorized|authentication|login|401/i.test(message)) return '本地 Codex 登录需要恢复，登录后可重试';
  if (/rate.?limit|quota|usage limit|429/i.test(message)) return 'Codex 使用额度或请求频率受限，稍后可重试';
  return fallback;
};

export class TripEngine {
  private readonly locks = new Set<string>();
  private readonly now: () => number;

  constructor(private readonly deps: EngineDeps) {
    this.now = deps.now || Date.now;
  }

  isBusy(id: string): boolean {
    return this.locks.has(`trip:${id}`);
  }

  private async withLock(key: string, work: () => Promise<void>): Promise<void> {
    if (this.locks.has(key)) return;
    this.locks.add(key);
    try { await work(); } finally { this.locks.delete(key); }
  }

  async initialize(id: string): Promise<void> {
    await this.withLock(`trip:${id}`, async () => {
      const trip = this.deps.read(id);
      if (!trip || trip.status !== 'planning') return;
      const task = this.deps.activity?.start(id, 'plan', `寻找 ${trip.destination.label} 的第一条路`);
      try {
        const plan = await this.deps.plan(trip, task?.report);
        const latest = this.deps.read(id);
        if (!latest || latest.status !== 'planning') return;
        latest.plan = plan;
        latest.status = 'active';
        latest.startedAt = new Date(this.now()).toISOString();
        latest.statusNote = null;
        latest.nextTickAt = new Date(this.now()).toISOString();
        this.deps.write(latest);
        task?.finish('completed', '初版路线已保存，开始旅程');
      } catch (error) {
        const latest = this.deps.read(id);
        if (!latest || latest.status !== 'planning') return;
        task?.finish('failed', failureNotice(error, '路线规划未完成，可以重试'));
        latest.statusNote = `本地 Codex 暂时无法完成规划：${errorMessage(error)}`;
        this.deps.write(latest);
      } finally { task?.finish('interrupted', '旅程状态已改变，本次规划未采用'); }
    });
    const ready = this.deps.read(id);
    if (ready?.status === 'active' && ready.spots.length === 0) void this.advance(id);
  }

  async advance(id: string): Promise<void> {
    let createdSpotId: string | null = null;
    await this.withLock(`trip:${id}`, async () => {
      const trip = this.deps.read(id);
      if (!trip || trip.status !== 'active') return;
      const now = this.now();
      if (trip.pace === 'event') {
        if (!canAdvanceEvent(trip)) return;
      } else if (new Date(trip.nextTickAt).getTime() > now) return;
      trip.currentDay = cyberDay(trip, now);
      if (!shouldRecordSpot(trip, now)) {
        trip.nextTickAt = nextCheckpointAt(now);
        this.deps.write(trip);
        return;
      }
      const task = this.deps.activity?.start(id, 'advance', `DAY ${trip.currentDay} · 安排下一段经历`);
      try {
        const { spot, newPlan, planChange, photoKinds, visitedPlanLegId, skippedPlanLegId, skipReason, continuityUpdates = [], newOpenConsequence = null } = await this.deps.advance(trip, task?.report);
        const latest = this.deps.read(id);
        if (!latest || latest.status !== 'active') return;
        const openThreads = (latest.consequenceThreads || []).filter(thread => thread.status === 'open');
        const openIds = new Set(openThreads.map(thread => thread.id));
        if (continuityUpdates.length !== openIds.size || new Set(continuityUpdates.map(update => update.threadId)).size !== openIds.size || continuityUpdates.some(update => !openIds.has(update.threadId) || !update.effect.trim() || (update.remaining !== null && !update.remaining.trim()))) throw new Error('本次节点没有完整承接此前事件的后果');
        if (newOpenConsequence && (!spot.event || !spot.consequence)) throw new Error('后果账本必须由实际事件创建');
        if (spot.event && !spot.consequence) throw new Error('事件缺少当下后果');
        if (Boolean(newPlan) !== Boolean(planChange) || (newPlan && !newPlan.length)) throw new Error('新计划与变更类型不匹配');
        const priorBranch = spot.branchSourceThreadId && openIds.has(spot.branchSourceThreadId) && continuityUpdates.some(update => update.threadId === spot.branchSourceThreadId);
        if (spot.branchSourceThreadId && !priorBranch) throw new Error('改路引用了不存在或未承接的旧事件');
        if (planChange !== 'rewrite' && spot.branchSourceThreadId) throw new Error('没有改路却引用了分支来源');
        if (planChange === 'rewrite' && (!spot.branchReason || !latest.plan.some(leg => leg.status === 'planned') || (!spot.event && !priorBranch) || (spot.event && !newOpenConsequence && !priorBranch))) throw new Error('改路必须由当前或此前尚未结清的事件触发');
        if (planChange === 'rewrite' && newPlan) {
          const signature = (leg: PlanLeg) => `${leg.place.lat.toFixed(3)}:${leg.place.lon.toFixed(3)}:${leg.transport.trim()}:${leg.activity.trim()}`;
          const oldDirection = latest.plan.filter(leg => leg.status === 'planned').map(signature).join('|');
          const replacement = newPlan.map(signature).join('|');
          if (oldDirection === replacement) throw new Error('改路后的计划与原方向相同');
        }
        if (visitedPlanLegId && !latest.plan.some(leg => leg.id === visitedPlanLegId && leg.status === 'planned')) throw new Error('代理标记了不存在或已完成的计划');
        if (skippedPlanLegId && (!skipReason?.trim() || !spot.event || !spot.consequence || skippedPlanLegId === visitedPlanLegId || !latest.plan.some(leg => leg.id === skippedPlanLegId && leg.status === 'planned'))) throw new Error('未完成计划必须关联具体意外及跳过原因');
        if (!skippedPlanLegId && skipReason) throw new Error('缺少被跳过的计划 ID');
        if (newPlan && new Set(newPlan.map(leg => leg.id)).size !== newPlan.length) throw new Error('新计划含重复 ID');
        latest.companions ||= [];
        const companionChanges = spot.companionChanges || [];
        const existingCompanionIds = new Set(latest.companions.map(person => person.id));
        const updatedCompanionIds = companionChanges.filter(change => change.id !== null).map(change => change.id);
        if (updatedCompanionIds.some(id => !existingCompanionIds.has(id!)) || new Set(updatedCompanionIds).size !== updatedCompanionIds.length) throw new Error('旅伴变化引用了不存在或重复的人物');
        for (const change of companionChanges) {
          if (change.travelingTogether && !spot.people.includes(change.name)) throw new Error('同行旅伴没有出现在本站人物记录中');
          const person = change.id ? latest.companions.find(item => item.id === change.id)! : {
            id: crypto.randomUUID(), name: change.name, source: 'encounter' as const, referenceUrls: [], appearance: change.appearance,
            travelingTogether: change.travelingTogether, relationship: change.relationship, whereabouts: change.whereabouts,
            firstDay: spot.day, lastDay: spot.day, history: [],
          };
          if (!change.id) latest.companions.push(person);
          change.id = person.id;
          person.name = change.name;
          person.travelingTogether = change.travelingTogether;
          person.relationship = change.relationship;
          person.whereabouts = change.whereabouts;
          person.appearance ||= change.appearance;
          person.lastDay = spot.day;
          person.history.push({ spotId: spot.id, day: spot.day, change: change.change, relationship: change.relationship, whereabouts: change.whereabouts, travelingTogether: change.travelingTogether });
        }
        if (visitedPlanLegId) {
          latest.plan = latest.plan.map(leg => leg.id === visitedPlanLegId && leg.status === 'planned'
            ? { ...leg, status: 'visited' as const, resolvedDay: spot.day }
            : leg);
        }
        if (skippedPlanLegId) {
          latest.plan = latest.plan.map(leg => leg.id === skippedPlanLegId && leg.status === 'planned'
            ? { ...leg, status: 'skipped' as const, resolvedDay: spot.day, resolutionNote: skipReason! }
            : leg);
        }
        if (newPlan) {
          latest.plan = (planChange === 'extend' ? latest.plan : latest.plan.map(leg => leg.status === 'planned' ? { ...leg, status: 'superseded' as const, resolvedDay: spot.day } : leg)).concat(newPlan);
          latest.planRevision += 1;
        }
        latest.consequenceThreads ||= [];
        for (const update of continuityUpdates) {
          const thread = latest.consequenceThreads.find(item => item.id === update.threadId)!;
          thread.history.push({ spotId: spot.id, day: spot.day, effect: update.effect, remaining: update.remaining });
          if (update.remaining === null) thread.status = 'resolved';
          else thread.pending = update.remaining;
        }
        if (newOpenConsequence) latest.consequenceThreads.push({ id: crypto.randomUUID(), originSpotId: spot.id, originDay: spot.day, trigger: spot.event!, pending: newOpenConsequence, status: 'open', history: [] });
        spot.continuityUpdates = continuityUpdates;
        spot.planRevision = latest.planRevision;
        const daySpots = latest.spots.filter(item => item.day === spot.day);
        spot.photos = spot.photoShots?.length
          ? choosePhotoShots(spot.photoShots, daySpots).map(shot => ({ id: crypto.randomUUID(), url: '', kind: shot.kind, caption: shot.caption, brief: shot.brief, status: 'pending' as const, attempts: 0 }))
          : choosePhotoKinds(photoKinds, daySpots).map(kind => ({ id: crypto.randomUUID(), url: '', kind, caption: kind === 'candid' ? '旅途随拍' : '此刻风景', status: 'pending' as const, attempts: 0 }));
        latest.spots.push(spot);
        latest.currentDay = Math.max(latest.currentDay, spot.day);
        latest.statusNote = null;
        latest.nextTickAt = nextCheckpointAt(this.now());
        this.deps.write(latest);
        createdSpotId = spot.id;
        task?.finish('completed', `${spot.place.label} 的日记已送达`);
      } catch (error) {
        const latest = this.deps.read(id);
        if (!latest || latest.status !== 'active') return;
        task?.finish('failed', failureNotice(error, '本次旅程推进未完成，可以重试'));
        latest.statusNote = `旅程推进待重试：${errorMessage(error)}`;
        latest.nextTickAt = nextCheckpointAt(this.now());
        this.deps.write(latest);
      } finally { task?.finish('interrupted', '旅程状态已改变，本次节点未采用'); }
    });
    if (createdSpotId) void this.resumePhotoJobs(id, createdSpotId);
  }

  async resumePhotoJobs(id: string, onlySpotId?: string): Promise<void> {
    const trip = this.deps.read(id);
    if (!trip) return;
    const jobs: Array<{ spotId: string; photoId: string }> = [];
    for (const spot of trip.spots) {
      if (onlySpotId && spot.id !== onlySpotId) continue;
      for (const [index, photo] of spot.photos.entries()) if (photo.status === 'pending') jobs.push({ spotId: spot.id, photoId: photo.id || `legacy-${index}` });
    }
    // A small pool makes four- and nine-photo moments useful without flooding Codex image generation.
    const workers = Array.from({ length: Math.min(2, jobs.length) }, async () => {
      while (jobs.length) {
        const job = jobs.shift()!;
        await this.producePhoto(id, job.spotId, job.photoId);
      }
    });
    await Promise.all(workers);
  }

  private async producePhoto(id: string, spotId: string, photoId: string): Promise<void> {
    await this.withLock(`photo:${id}:${spotId}:${photoId}`, async () => {
      const trip = this.deps.read(id);
      const spot = trip?.spots.find(item => item.id === spotId);
      const photoIndex = photoId.startsWith('legacy-') ? Number(photoId.slice(7)) : spot?.photos.findIndex(item => item.id === photoId);
      const photo = photoIndex === undefined ? undefined : spot?.photos[photoIndex];
      if (!trip || !spot || !photo || photoIndex === undefined || photo.status !== 'pending') return;
      const targetIndex = photoIndex;
      if ((photo.attempts || 0) >= MAX_PHOTO_ATTEMPTS) {
        photo.status = 'failed';
        photo.error = '已达到自动恢复次数，请手动重试';
        trip.statusNote = '照片生成失败，可重试缺失的照片。';
        this.deps.write(trip);
        return;
      }
      photo.attempts = (photo.attempts || 0) + 1;
      this.deps.write(trip);
      const task = this.deps.activity?.start(id, 'photo', `DAY ${spot.day} · ${photo.caption}`, { spotId, photoId });
      try {
        const url = await this.deps.photo(trip, spot, photo, task?.report);
        const latest = this.deps.read(id);
        const target = latest?.spots.find(item => item.id === spotId)?.photos[targetIndex];
        if (!latest || !target || target.status !== 'pending') return;
        target.url = url;
        target.status = 'ready';
        target.error = null;
        task?.report('照片已保存，正在发布到朋友圈');
        if (latest.statusNote?.startsWith('照片生成失败') && !latest.spots.some(item => item.photos.some(p => p.status === 'failed'))) latest.statusNote = null;
        this.deps.write(latest);
        task?.finish('completed', '照片已送达');
      } catch (error) {
        task?.finish('failed', failureNotice(error, '这张照片未生成成功，可以重试'));
        const latest = this.deps.read(id);
        const target = latest?.spots.find(item => item.id === spotId)?.photos[targetIndex];
        if (!latest || !target || target.status !== 'pending') return;
        target.status = 'failed';
        target.error = errorMessage(error);
        if (!latest.statusNote || latest.statusNote.startsWith('照片')) latest.statusNote = '照片生成失败，可重试缺失的照片。';
        this.deps.write(latest);
      } finally { task?.finish('interrupted', '照片任务已停止'); }
    });
  }

  retryPhotos(id: string): number {
    const trip = this.deps.read(id);
    if (!trip) return 0;
    let count = 0;
    for (const spot of trip.spots) for (const photo of spot.photos) {
      if (photo.status !== 'failed') continue;
      photo.status = 'pending';
      photo.attempts = 0;
      photo.error = null;
      count += 1;
    }
    if (count > 0) {
      if (trip.statusNote?.startsWith('照片')) trip.statusNote = null;
      this.deps.write(trip);
    }
    if (count > 0 || trip.spots.some(spot => spot.photos.some(photo => photo.status === 'pending'))) void this.resumePhotoJobs(id);
    return count;
  }

  end(id: string): Trip | null {
    const trip = this.deps.read(id);
    if (!trip) return null;
    if (trip.status === 'ended') return trip;
    trip.status = 'ended';
    trip.endedAt = new Date(this.now()).toISOString();
    this.deps.write(trip);
    void this.finishBook(id);
    return trip;
  }

  async finishBook(id: string): Promise<void> {
    await this.withLock(`book:${id}`, async () => {
    const trip = this.deps.read(id);
    if (!trip || trip.status !== 'ended') return;
    const task = this.deps.activity?.start(id, 'book', '为这次旅行装订相册');
    try {
      const book = await this.deps.book(trip, task?.report);
      const latest = this.deps.read(id);
      if (!latest || latest.status !== 'ended') return;
      latest.bookTitle = book.title;
      latest.bookClosing = book.closing;
      if (latest.statusNote?.startsWith('相册文案')) latest.statusNote = null;
      this.deps.write(latest);
      task?.finish('completed', '相册封面与末页已写好');
    } catch (error) {
      task?.finish('failed', failureNotice(error, '相册整理未完成，可以重试'));
      const latest = this.deps.read(id);
      if (!latest || latest.status !== 'ended') return;
      latest.bookTitle = `在别处 · ${trip.destination.label}`;
      latest.bookClosing = '旅途暂时合上，路上的每一页都还在。';
      latest.statusNote = `相册文案待重试：${errorMessage(error)}`;
      this.deps.write(latest);
    } finally { task?.finish('interrupted', '相册整理已停止'); }
    });
  }
}
