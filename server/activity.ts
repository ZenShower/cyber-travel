import { randomUUID } from 'node:crypto';
import type { ActivityKind, ActivitySnapshot, ActivityTask, ProgressReporter } from '../src/activityTypes.js';

// Separate from Trip writes: concurrent photo workers must never overwrite travel state.
export class ActivityRegistry {
  private tasks: ActivityTask[];
  constructor(private changed: (tripId: string) => void = () => {}, initial: ActivityTask[] = [], private now = Date.now) {
    this.tasks = initial.map(task => task.status === 'running' ? {
      ...task, status: 'interrupted', finishedAt: now(), updatedAt: now(), message: '本地服务重启，上次执行已中断。',
      history: [...task.history.slice(-7), { at: now(), message: '本地服务重启，上次执行已中断。' }],
    } : task);
  }
  all(): ActivityTask[] { return structuredClone(this.tasks); }
  snapshot(tripId: string): ActivitySnapshot {
    const tasks = this.tasks.filter(task => task.tripId === tripId);
    const recent = new Set(tasks.slice(-40).map(task => task.id));
    return { tripId, serverTime: this.now(), tasks: structuredClone(tasks.filter(task => task.status === 'running' || recent.has(task.id))) };
  }
  start(tripId: string, kind: ActivityKind, label: string, target: { spotId?: string; photoId?: string } = {}) {
    const at = this.now();
    const task: ActivityTask = { id: randomUUID(), tripId, kind, label, ...target, status: 'running', startedAt: at, updatedAt: at,
      message: '正在连接本地 Codex', history: [{ at, message: '正在连接本地 Codex' }] };
    this.tasks.push(task);
    const settled = this.tasks.filter(item => item.status !== 'running');
    if (settled.length > 240) {
      const remove = new Set(settled.slice(0, settled.length - 240).map(item => item.id));
      this.tasks = this.tasks.filter(item => !remove.has(item.id));
    }
    this.changed(tripId);
    const report: ProgressReporter = message => {
      if (task.status !== 'running') return;
      const now = this.now();
      // Repeated events are real activity, but do not flood the visible timeline.
      if (message === task.message && now - task.updatedAt < 1000) return;
      task.updatedAt = now;
      if (task.message !== message) {
        task.message = message;
        task.history = [...task.history.slice(-7), { at: now, message }];
      }
      this.changed(tripId);
    };
    const finish = (status: Exclude<ActivityTask['status'], 'running'>, message: string) => {
      if (task.status !== 'running') return;
      report(message);
      task.status = status;
      task.finishedAt = task.updatedAt = this.now();
      this.changed(tripId);
    };
    return { report, finish };
  }
}
