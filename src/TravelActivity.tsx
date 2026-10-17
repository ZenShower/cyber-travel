import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle, Radio, RotateCcw, WifiOff } from 'lucide-react';
import type { ActivitySnapshot, ActivityTask } from './activityTypes.js';

type ActivityTrip = {
  id: string; status: string; nextTickAt: string; statusNote: string | null;
  spots: Array<{ photos: Array<{ status: string }> }>;
};
const kindNames = { plan: '路线规划', advance: '旅途见闻', photo: '旅行照片', book: '相册装订' };
const duration = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};

export function useTravelActivity(id: string | null, onTripUpdate: () => void) {
  const [snapshot, setSnapshot] = useState<ActivitySnapshot | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [clock, setClock] = useState(Date.now());
  const lastPacket = useRef(0);
  const offset = useRef(0);
  const update = useRef(onTripUpdate);
  update.current = onTripUpdate;
  useEffect(() => {
    setSnapshot(null); setConnection('connecting'); lastPacket.current = 0; offset.current = 0;
    if (!id) return;
    const stream = new EventSource(`/api/trips/${encodeURIComponent(id)}/activity`);
    const received = (serverTime: number) => {
      lastPacket.current = Date.now(); offset.current = serverTime - Date.now();
      setClock(serverTime); setConnection('live');
    };
    stream.addEventListener('activity', event => {
      try {
        const data: ActivitySnapshot = JSON.parse((event as MessageEvent).data);
        if (data.tripId !== id) return;
        received(data.serverTime); setSnapshot(data);
      } catch { setConnection('offline'); }
    });
    stream.addEventListener('heartbeat', event => received(Number((event as MessageEvent).data)));
    stream.addEventListener('trip', () => update.current());
    stream.onerror = () => setConnection('offline');
    const timer = window.setInterval(() => {
      setClock(Date.now() + offset.current);
      if (lastPacket.current && Date.now() - lastPacket.current > 40_000) setConnection('offline');
    }, 1000);
    return () => { stream.close(); window.clearInterval(timer); };
  }, [id]);
  return { snapshot: snapshot?.tripId === id ? snapshot : null, connection, clock };
}

export function TravelActivity({ trip, activity, onRetry, compact = false }: {
  trip: ActivityTrip; activity: ReturnType<typeof useTravelActivity>;
  onRetry: (task: ActivityTask) => Promise<void>; compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  useEffect(() => { setExpanded(false); setRetryError(''); }, [trip.id]);
  const { snapshot, connection, clock } = activity;
  const tasks = snapshot?.tasks || [];
  const running = tasks.filter(task => task.status === 'running');
  const primary = running.find(task => task.kind !== 'photo') || running[0];
  const latest = tasks.at(-1);
  const failed = tasks.filter(task => task.status === 'failed' || task.status === 'interrupted')
    .filter(task => !tasks.some(later => later.startedAt >= task.startedAt && later.id !== task.id && later.kind === task.kind && later.spotId === task.spotId && later.photoId === task.photoId)).at(-1);
  const photos = trip.spots.flatMap(spot => spot.photos);
  const pending = photos.filter(photo => photo.status === 'pending').length;
  const ready = photos.filter(photo => photo.status === 'ready').length;
  const photoFailures = photos.filter(photo => photo.status === 'failed').length;
  const quiet = primary && clock - primary.updatedAt >= 90_000;
  const interrupted = failed?.status === 'interrupted';
  const title = primary?.label || (trip.statusNote ? '这段旅程需要再试一次' : pending ? '照片正在排队寄回' : trip.status === 'planning' ? '等第一条路，慢慢清晰' : trip.status === 'paused' ? '旅程暂时停在这里' : trip.status === 'ended' ? '这一路，已经留在相册里' : '分身在路上，你继续手边的事');
  const message = primary?.message || (trip.statusNote ? failed?.message || '上一次执行未完成，展开可查看状态并重试。' : interrupted ? '本地服务曾重启，上次执行已中断。' : pending ? `${pending} 张照片等待处理，完成后会自动出现在朋友圈。` : trip.status === 'active' ? `下一次旅途检查：${new Date(trip.nextTickAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : trip.status === 'planning' ? '本地服务已接收旅程，等待 Codex 开始规划。' : latest?.message || '随时翻看地图上的故事。');
  const connectionLabel = connection === 'live' ? '本地服务已连接' : connection === 'connecting' ? '正在连接' : '连接中断 · 自动重连';
  const canRetry = failed && !running.some(task => task.kind === failed.kind) && (failed.kind === 'book' || failed.kind === 'photo' || trip.status === 'planning' || trip.status === 'active');
  const retry = async () => {
    if (!failed) return;
    setRetrying(true); setRetryError('');
    try { await onRetry(failed); } catch (error) { setRetryError(error instanceof Error ? error.message : String(error)); }
    finally { setRetrying(false); }
  };
  return <section className={`travel-activity ${compact ? 'activity-in-book' : ''} ${primary ? 'is-running' : ''}`} aria-label="旅行执行实况">
    <div className="activity-masthead"><span><Radio size={14} /> 旅行实况 <i>LIVE FROM ELSEWHERE</i></span><span className={`activity-connection ${connection}`}><b />{connectionLabel}</span></div>
    <button className="activity-toggle" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
      <span className="activity-symbol">{primary ? <LoaderCircle size={23} className="activity-spin" /> : trip.statusNote || interrupted ? <RotateCcw size={21} /> : <Check size={22} />}</span>
      <span className="activity-heading"><strong>{title}</strong><span aria-live="polite">{message}</span></span><ChevronDown size={16} className={expanded ? 'is-open' : ''} />
    </button>
    {primary && <div className="activity-meter"><span>{kindNames[primary.kind]} · 已用 {duration(clock - primary.startedAt)}</span><span>最近活动 {duration(clock - primary.updatedAt)}前</span></div>}
    {(pending > 0 || photoFailures > 0) && <div className="activity-photos"><span>照片寄回</span><div>{photos.map((photo, index) => <i key={index} className={photo.status} />)}</div><b>{ready}/{photos.length}</b>{photoFailures > 0 && <small>{photoFailures} 张待重试</small>}</div>}
    {quiet && connection === 'live' && <p className="activity-notice">本地服务仍连接着，但 Codex 已有 {duration(clock - primary.updatedAt)}没有新消息。仍在等待下一条更新。</p>}
    {connection === 'offline' && <p className="activity-notice"><WifiOff size={13} /> 暂时无法确认执行状态。连接恢复后会自动补上最新进展。</p>}
    {expanded && <div className="activity-details">
      {running.length > 1 && <p className="activity-parallel">同时在进行 {running.length} 项任务 · 生图完成一张就寄回一张</p>}
      {(running.length ? [...running, ...tasks.filter(task => task.status !== 'running').slice(-3)] : tasks.slice(-5)).map(task => <div className={`activity-task ${task.status}`} key={task.id}>
        <div className="activity-task-title"><strong>{task.label}</strong><span>{task.status === 'running' ? '进行中' : task.status === 'completed' ? '已完成' : task.status === 'interrupted' ? '已中断' : '未完成'}</span></div>
        <ol>{task.history.map((event, index) => <li key={`${event.at}-${index}`}><time>{new Date(event.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span>{event.message}</span></li>)}</ol>
      </div>)}
      {!tasks.length && <p className="activity-empty">这里会记下本次路线规划、旅途记录和照片生成的执行进展。</p>}
      {canRetry && <button className="activity-retry" disabled={retrying} onClick={() => void retry()}><RotateCcw size={14} />{retrying ? '正在提交' : `重试${kindNames[failed.kind]}`}</button>}
      {retryError && <p className="activity-notice">{retryError}</p>}
    </div>}
  </section>;
}
