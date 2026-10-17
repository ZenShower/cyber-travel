export type ActivityKind = 'plan' | 'advance' | 'photo' | 'book';
export type ActivityStatus = 'running' | 'completed' | 'failed' | 'interrupted';
export type ActivityTask = {
  id: string; tripId: string; kind: ActivityKind; label: string;
  status: ActivityStatus; startedAt: number; updatedAt: number; finishedAt?: number;
  message: string; spotId?: string; photoId?: string;
  history: Array<{ at: number; message: string }>;
};
export type ActivitySnapshot = { tripId: string; serverTime: number; tasks: ActivityTask[] };
export type ProgressReporter = (message: string) => void;
