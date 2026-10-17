import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './travelPace.css';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Camera, Check, ChevronLeft, ChevronRight, Compass, Download, Globe2, ImagePlus, LocateFixed, MapPin, Pause, Play, RotateCcw, Search, Shuffle, Sparkles, X } from 'lucide-react';
import { mergeReferencePhotos, MAX_REFERENCE_PHOTOS } from './photos.js';
import { downloadMomentPoster } from './momentPoster.js';
import { BookExperience } from './BookExperience.js';
import { TravelActivity, useTravelActivity } from './TravelActivity.js';
import type { ActivityTask } from './activityTypes.js';
import { installAtlasDetails } from './mapAtlas.js';
import { clusterStops } from './mapClusters.js';

type Point = { lat: number; lon: number; label: string };
type PlanLeg = { id: string; title: string; place: Point; transport: string; activity?: string; why: string; localBasis?: string; accessNotes?: string; sourceUrl?: string | null; status: 'planned' | 'visited' | 'skipped' | 'superseded'; introducedDay?: number; resolvedDay?: number; resolutionNote?: string; planningNotes?: string };
type Photo = { id?: string; url: string; kind: 'candid' | 'landscape'; caption: string; status: 'ready' | 'pending' | 'failed'; attempts?: number; error?: string | null };
type ContinuityUpdate = { threadId: string; effect: string; remaining: string | null };
type ConsequenceThread = { id: string; originSpotId: string; originDay: number; trigger: string; pending: string; status: 'open' | 'resolved'; history: Array<{ spotId: string; day: number; effect: string; remaining: string | null }> };
type CompanionChange = { id: string | null; name: string; travelingTogether: boolean; relationship: string; whereabouts: string; change: string; appearance: string | null };
type Companion = { id: string; name: string; source: 'uploaded' | 'encounter'; referenceUrls: string[]; travelingTogether: boolean; relationship: string; whereabouts: string; firstDay: number; lastDay: number };
type Spot = { id: string; day: number; happenedAt: string; place: Point; title: string; diary: string; activity: string; transport: string; movement?: { mode: string; durationMinutes: number | null; basis: string | null }; stay: string; people: string[]; companionChanges?: CompanionChange[]; event: string | null; consequence: string | null; sourceUrl?: string | null; photoDirection: string; photos: Photo[]; planRevision: number; branchReason: string | null; branchSourceThreadId?: string | null; continuityUpdates?: ContinuityUpdate[] };
type Trip = { pace?: 'realtime' | 'event'; id: string; createdAt: string; startedAt: string | null; endedAt: string | null; status: 'planning' | 'active' | 'paused' | 'ended'; statusNote: string | null; experimentNote?: string | null; travelerName: string; avatarUrls: string[]; companions?: Companion[]; destination: Point; currentDay: number; nextTickAt: string; planRevision: number; plan: PlanLeg[]; spots: Spot[]; consequenceThreads?: ConsequenceThread[]; bookTitle: string | null; bookClosing: string | null; sharePosterUrl?: string | null; simulation?: boolean };

function MomentLocation({ place }: { place: Point }) {
  const query = new URLSearchParams({ api: '1', query: `${place.lat},${place.lon}` });
  return <a className="wechat-location" href={`https://www.google.com/maps/search/?${query}`} target="_blank" rel="noopener noreferrer" title={`在 Google Maps 中打开 ${place.label}`} aria-label={`${place.label}，在 Google Maps 中打开`}><MapPin size={13} />{place.label}</a>;
}

const demoPoint: Point = { lat: 69.6492, lon: 18.9553, label: '特罗姆瑟 · 挪威' };
const worldCenter: [number, number] = [0, 20];
const worldZoom = 0.8;
maplibregl.setWorkerUrl(workerUrl);
const demoTrip: Trip = {
  id: 'demo', createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), endedAt: null, status: 'active', statusNote: null, travelerName: '你的分身', avatarUrls: [], destination: demoPoint, currentDay: 2, nextTickAt: '', planRevision: 2,
  plan: [
    { id: 'a', title: '01 · 海港边的第一夜', place: demoPoint, transport: '步行', activity: '港口散步', why: '先适应北方漫长的光线', status: 'visited' },
    { id: 'b', title: '02 · 原计划乘车去峡湾', place: { lat: 69.537, lon: 18.987, label: '厄斯峡湾' }, transport: '巴士', activity: '峡湾步道', why: '看峡湾与雪山', status: 'superseded' },
    { id: 'c', title: '02 · 在民宿多留一天', place: demoPoint, transport: '步行', activity: '和民宿主人做饭', why: '窗外的雪和临时邀约改变了方向', status: 'planned' },
  ],
  spots: [{ id: 'sample', day: 2, happenedAt: new Date().toISOString(), place: demoPoint, title: '窗外的雪，把行程按下了暂停', diary: '原本打算一早去峡湾。起床时窗外的山只剩一半，雪把港口罩成了灰白色。民宿主人说今天车可能不准点，问我要不要留在厨房一起做午饭。我把背包重新放回地上，切洋葱时眼睛有点酸。照片里没有什么大事件，但那扇窗让我觉得，多留一天也完全可以。', activity: '在民宿做饭，等雪小一点', transport: '原定巴士，改为步行', stay: '海港边的木屋民宿', people: ['民宿主人'], event: '突来的雪让原定巴士行程变得不稳妥', consequence: '在特罗姆瑟多停留一天，峡湾路线暂缓', photoDirection: '室内生活随拍', photos: [{ url: '/demo/window.svg', kind: 'candid', caption: '民宿的早晨 · 插画示意', status: 'ready' }], planRevision: 2, branchReason: '天气改变了原先的交通和停留时间' }], consequenceThreads: [{ id: 'demo-snow', originSpotId: 'sample', originDay: 2, trigger: '突来的雪让原定巴士行程变得不稳妥', pending: '明早核对交通和路况，再决定是否继续去峡湾。', status: 'open', history: [] }], bookTitle: null, bookClosing: null,
};

const durationLabel = (minutes: number | null | undefined) => minutes == null ? '耗时待核实' : minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}` : `${minutes}分钟`;
const travelIcon = (value: string) => /船|渡|ferry/i.test(value) ? '⛴' : /飞|航|flight/i.test(value) ? '✈' : /骑|bike/i.test(value) ? '🚲' : /车|bus|drive|car/i.test(value) ? '🚙' : /步|徒|walk|hike/i.test(value) ? '🥾' : '↝';
const travelName = (value: string) => /船|渡|ferry/i.test(value) ? '渡轮' : /飞|航|flight/i.test(value) ? '飞机' : /骑|bike/i.test(value) ? '骑行' : /巴士|公交|bus/i.test(value) ? '巴士' : /自驾|drive|car/i.test(value) ? '自驾' : /步|徒|walk|hike/i.test(value) ? '步行' : value.slice(0, 5);
function curvedSegment(from: Point, to: Point, seed: number): [number, number][] {
  const dx = to.lon - from.lon;
  const dy = to.lat - from.lat;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.0001) return [];
  const bend = Math.min(distance * .18, 1.2) * (seed % 2 ? 1 : -1);
  return Array.from({ length: 19 }, (_, index) => {
    const t = index / 18;
    const lift = Math.sin(Math.PI * t) * bend / distance;
    return [from.lon + dx * t - dy * lift, from.lat + dy * t + dx * lift];
  });
}
function MapCanvas({ trip, chosen, onChoose, onSpot, selectedSpot }: { trip: Trip | null; chosen: Point | null; onChoose: (point: Point) => void; onSpot: (spot: Spot) => void; selectedSpot: string | null }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const cameraKey = useRef('');
  const onChooseRef = useRef(onChoose);
  const onSpotRef = useRef(onSpot);
  onChooseRef.current = onChoose;
  onSpotRef.current = onSpot;
  const mapSignature = JSON.stringify(trip && [trip.id, trip.status, trip.destination,
    trip.spots.map(spot => [spot.id, spot.day, spot.place, spot.title, spot.transport, spot.movement]),
    trip.plan.map(leg => [leg.id, leg.place, leg.status])]);
  useEffect(() => {
    if (!element.current) return;
    const instance = new maplibregl.Map({ container: element.current, style: '/maps/travel-atlas.json', center: worldCenter, zoom: worldZoom, attributionControl: false });
    map.current = instance;
    cameraKey.current = '';
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
    instance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    instance.once('load', () => installAtlasDetails(instance));
    instance.on('click', event => onChooseRef.current({ lon: event.lngLat.lng, lat: event.lngLat.lat, label: `${event.lngLat.lat.toFixed(3)}, ${event.lngLat.lng.toFixed(3)}` }));
    return () => { instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    let popup: maplibregl.Popup | null = null;
    let stopMarkers: Marker[] = [];
    const tickets: Array<{ marker: Marker; point: [number, number]; node: HTMLButtonElement; connector: HTMLSpanElement }> = [];
    let clusterKey = '';
    let frame = 0;
    let layoutStops = () => {};
    const draw = () => {
      for (const marker of markers.current) marker.remove();
      markers.current = [];
      for (const id of ['actual-route', 'actual-route-halo', 'planned-route']) if (instance.getLayer(id)) instance.removeLayer(id);
      for (const id of ['actual-route', 'planned-route']) if (instance.getSource(id)) instance.removeSource(id);
      if (trip) {
        const actual = trip.spots.slice(1).map((spot, index) => curvedSegment(trip.spots[index].place, spot.place, index)).filter(line => line.length);
        if (actual.length) {
          instance.addSource('actual-route', { type: 'geojson', data: { type: 'FeatureCollection', features: actual.map(coordinates => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } })) } });
          instance.addLayer({ id: 'actual-route-halo', type: 'line', source: 'actual-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff7df', 'line-width': 8, 'line-opacity': .92 } });
          instance.addLayer({ id: 'actual-route', type: 'line', source: 'actual-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#d87652', 'line-width': 3.5, 'line-opacity': .96, 'line-dasharray': [2, 1.4] } });
        }
        const from = trip.spots.at(-1)?.place || trip.destination;
        const planned = trip.status === 'ended' ? [] : [from, ...trip.plan.filter(leg => leg.status === 'planned').map(leg => leg.place)];
        const future = planned.slice(1).map((point, index) => curvedSegment(planned[index], point, index + trip.spots.length)).filter(line => line.length);
        if (future.length) {
          instance.addSource('planned-route', { type: 'geojson', data: { type: 'FeatureCollection', features: future.map(coordinates => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } })) } });
          instance.addLayer({ id: 'planned-route', type: 'line', source: 'planned-route', paint: { 'line-color': '#78978a', 'line-width': 2.5, 'line-dasharray': [2, 2], 'line-opacity': .85 } });
        }
        const updateStops = () => {
          const screens = trip.spots.map(spot => instance.project([spot.place.lon, spot.place.lat]));
          const groups = clusterStops(screens);
          const key = groups.map(group => group.indices.join(',')).join('|');
          if (key !== clusterKey) {
            stopMarkers.forEach(marker => marker.remove()); stopMarkers = []; clusterKey = key;
            for (const group of groups) {
              const visits = group.indices.map(index => trip.spots[index]);
              const selected = visits.some(spot => spot.id === selectedSpot);
              const current = group.indices.includes(trip.spots.length - 1);
              // MapLibre owns the outer transform. All visual styling lives inside.
              const anchor = document.createElement('div'); anchor.className = 'map-marker-anchor';
              const node = document.createElement('button');
              node.className = `map-stop-pin ${selected ? 'selected' : ''} ${current ? 'current' : ''} ${visits.length > 1 ? 'cluster' : ''}`;
              node.style.setProperty('--stop-color', ['#df7652', '#67947c', '#b7934b', '#6a9ab0', '#b27b87'][group.indices[0] % 5]);
              const number = document.createElement('span'); number.className = 'map-stop-number';
              number.textContent = visits.length > 1 ? String(visits.length) : String(group.indices[0] + 1).padStart(2, '0');
              const label = document.createElement('span'); label.className = 'map-stop-label';
              label.textContent = visits.length > 1 ? `${visits.length} 段足迹 · ${visits[0].place.label.split(' · ')[0]}` : visits[0].place.label.split(' · ')[0];
              node.append(number, label); anchor.append(node);
              node.setAttribute('aria-label', visits.length > 1 ? `查看这一带的 ${visits.length} 段足迹` : `DAY ${visits[0].day} · ${visits[0].title}`);
              node.title = visits.map(spot => `DAY ${spot.day} · ${spot.title}`).join('\n');
              node.addEventListener('click', event => {
                event.stopPropagation();
                if (visits.length === 1) { popup?.remove(); onSpotRef.current(visits[0]); return; }
                popup?.remove();
                const content = document.createElement('div'); content.className = 'atlas-visit-list';
                const heading = document.createElement('strong'); heading.textContent = `这一带留下了 ${visits.length} 段足迹`; content.append(heading);
                for (const spot of visits) {
                  const button = document.createElement('button');
                  const day = document.createElement('small'); day.textContent = `DAY ${spot.day} · ${spot.place.label.split(' · ')[0]}`;
                  const title = document.createElement('span'); title.textContent = spot.title;
                  button.append(day, title);
                  button.addEventListener('click', e => { e.stopPropagation(); popup?.remove(); onSpotRef.current(spot); });
                  content.append(button);
                }
                const zoom = document.createElement('button'); zoom.className = 'atlas-zoom-area'; zoom.textContent = '放大这一带 ↗';
                const position = stopMarkers[groups.indexOf(group)]?.getLngLat() || instance.unproject([group.x, group.y]);
                zoom.addEventListener('click', e => { e.stopPropagation(); popup?.remove(); instance.easeTo({ center: position, zoom: Math.min(20, instance.getZoom() + 2), duration: 500 }); });
                content.append(zoom);
                popup = new maplibregl.Popup({ offset: 25, maxWidth: '310px', className: 'atlas-visits-popup' }).setLngLat(position).setDOMContent(content).addTo(instance);
              });
              stopMarkers.push(new maplibregl.Marker({ element: anchor, anchor: 'center', subpixelPositioning: true }).setLngLat(instance.unproject([group.x, group.y])).addTo(instance));
            }
          }
          groups.forEach((group, index) => {
            const marker = stopMarkers[index]; if (!marker) return;
            marker.setLngLat(instance.unproject([group.x, group.y]));
            const selected = group.indices.some(i => trip.spots[i].id === selectedSpot);
            const overlapsLabel = groups.some((other, j) => j !== index && Math.abs(other.x - group.x) < 155 && Math.abs(other.y - group.y) < 85);
            marker.getElement().querySelector('.map-stop-pin')?.classList.toggle('compact', overlapsLabel && !selected);
          });
          for (const ticket of tickets) {
            if (!ticket.node.classList.contains('selected')) continue;
            const point = instance.project(ticket.point);
            const offsets: [number, number][] = [[0,0],[0,-70],[0,70],[125,0],[-125,0],[0,-115],[0,115]];
            const offset = offsets.find(([dx,dy]) => !groups.some(group => Math.abs(point.x+dx-group.x)<105 && Math.abs(point.y+dy-group.y)<68)) || [0,-115];
            ticket.marker.setOffset(offset as [number,number]);
            const [dx,dy]=offset;
            ticket.connector.style.height=`${Math.hypot(dx,dy)}px`;
            ticket.connector.style.transform=`rotate(${Math.atan2(dx,-dy)*180/Math.PI}deg)`;
            ticket.connector.hidden=dx===0 && dy===0;
          }
        };
        layoutStops = updateStops; updateStops();
        trip.spots.forEach((spot, index) => {
          if (index > 0) {
            const curve = curvedSegment(trip.spots[index - 1].place, spot.place, index - 1);
            if (curve.length) {
              const mid = curve[Math.floor(curve.length / 2)];
              const ticket = document.createElement('button'); ticket.className = `map-leg-ticket ${selectedSpot === spot.id || (!selectedSpot && index === trip.spots.length - 1) ? 'selected' : ''}`;
              const mode = spot.movement?.mode || spot.transport;
              ticket.textContent = `${travelIcon(mode)} ${travelName(mode)} · ${durationLabel(spot.movement?.durationMinutes)}`;
              ticket.title = `前往${spot.place.label}：${spot.transport}${spot.movement?.basis ? `；${spot.movement.basis}` : ''}`;
              ticket.addEventListener('click', e => { e.stopPropagation(); onSpotRef.current(spot); });
              const connector=document.createElement('span'); connector.className='map-ticket-connector'; connector.setAttribute('aria-hidden','true'); connector.hidden=true; ticket.append(connector);
              const marker=new maplibregl.Marker({ element: ticket, subpixelPositioning: true }).setLngLat(mid as [number, number]).addTo(instance);
              markers.current.push(marker); tickets.push({marker, point:mid, node:ticket, connector});
            }
          }
        });
        layoutStops();
      } else if (chosen) {
        const anchor = document.createElement('div'); anchor.className = 'map-marker-anchor';
        const node = document.createElement('div'); node.className = 'map-pin selected'; node.textContent = '✦'; anchor.append(node);
        markers.current.push(new maplibregl.Marker({ element: anchor, subpixelPositioning: true }).setLngLat([chosen.lon, chosen.lat]).addTo(instance));
      }
    };
    // Loading new tiles during a drag must not wait for a second initial-load event.
    if (instance.getLayer('background')) draw(); else instance.once('load', draw);
    const scheduleLayout = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; layoutStops(); }); };
    for (const event of ['zoom', 'rotate', 'pitch', 'resize'] as const) instance.on(event, scheduleLayout);
    const nextCameraKey = JSON.stringify([trip?.id, trip?.spots.map(spot => [spot.id, spot.place.lon, spot.place.lat]), chosen, selectedSpot]);
    const selected = trip?.spots.find(item => item.id === selectedSpot);
    if (cameraKey.current === nextCameraKey) { /* Keep the user's camera when only photos or activity change. */ }
    else if (selected) instance.flyTo({ center: [selected.place.lon, selected.place.lat], zoom: Math.max(instance.getZoom(), 8.5), essential: true, duration: 850 });
    else if (trip?.spots.length) {
      const bounds = new maplibregl.LngLatBounds();
      trip.spots.forEach(item => bounds.extend([item.place.lon, item.place.lat]));
      instance.fitBounds(bounds, { padding: { top: 95, bottom: 125, left: 100, right: 100 }, maxZoom: 8.2, duration: 850 });
    } else {
      const target = trip?.destination || chosen;
      if (target) instance.flyTo({ center: [target.lon, target.lat], zoom: trip ? 7 : 5.4, essential: true, duration: 850 });
      else instance.flyTo({ center: worldCenter, zoom: worldZoom, essential: true, duration: 850 });
    }
    cameraKey.current = nextCameraKey;
    return () => {
      instance.off('load', draw);
      for (const event of ['zoom', 'rotate', 'pitch', 'resize'] as const) instance.off(event, scheduleLayout);
      cancelAnimationFrame(frame); popup?.remove(); stopMarkers.forEach(marker => marker.remove());
    };
  }, [mapSignature, chosen, selectedSpot]);
  return <div ref={element} className="map-canvas" aria-label="可点击选择目的地的世界地图" />;
}

function SpotPhotos({ spot, book = false, emptyLabel }: { spot: Spot | null; book?: boolean; emptyLabel?: string }) {
  const [opened, setOpened] = useState<number | null>(null);
  const ready = spot?.photos.filter(photo => photo.status === 'ready' && photo.url) || [];
  const expected = spot?.photos.length || 0;
  const gridSize = expected >= 9 ? 9 : expected >= 4 ? 4 : Math.max(ready.length, 1);
  return <div className={`spot-photo-set ${book ? 'in-book' : ''}`}>
    <div className={`moment-grid grid-${gridSize}`} aria-label={`这一站的 ${ready.length} 张照片`}>
      {ready.length ? ready.map((photo, index) => <button key={photo.id || `${photo.url}-${index}`} className="moment-photo" type="button" title={photo.caption} onClick={() => setOpened(index)}><img src={photo.url} alt={`${spot?.title || '旅途'} · ${photo.caption}`} loading={index > 3 ? 'lazy' : 'eager'} /></button>) : <div className="moment-empty"><Camera size={29} /><span>{emptyLabel || '下一张照片，还在路上'}</span></div>}
      {spot?.photos.filter(photo => photo.status === 'pending').map((photo, index) => <div key={photo.id || `pending-${index}`} className="moment-pending"><Camera size={18} /><span>生成中</span></div>)}
    </div>
    {opened !== null && ready[opened] && <div className="moment-lightbox" role="dialog" aria-modal="true" aria-label="照片预览" onClick={() => setOpened(null)}><button className="moment-lightbox-close" onClick={() => setOpened(null)} aria-label="关闭照片"><X size={21} /></button><img src={ready[opened].url} alt={ready[opened].caption} onClick={event => event.stopPropagation()} /><div className="moment-lightbox-caption"><span>{opened + 1} / {ready.length}</span><strong>{ready[opened].caption}</strong></div>{opened > 0 && <button className="moment-lightbox-prev" onClick={event => { event.stopPropagation(); setOpened(opened - 1); }} aria-label="上一张"><ChevronLeft /></button>}{opened < ready.length - 1 && <button className="moment-lightbox-next" onClick={event => { event.stopPropagation(); setOpened(opened + 1); }} aria-label="下一张"><ChevronRight /></button>}</div>}
  </div>;
}

function CompanionNotes({ spot }: { spot: Spot }) {
  if (!spot.companionChanges?.length) return null;
  return <div className="wechat-companions">{spot.companionChanges.map((change, index) => <p key={`${change.id || change.name}-${index}`}><strong>{change.name}</strong> · {change.change}<small>{change.travelingTogether ? '此刻同行' : change.whereabouts} · {change.relationship}</small></p>)}</div>;
}

function App() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [demo, setDemo] = useState(false);
  const [chosen, setChosen] = useState<Point | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [startingCompanions, setStartingCompanions] = useState<Array<{ name: string; photo: File | null }>>([]);
  const [companionPreviews, setCompanionPreviews] = useState<string[]>([]);
  const [travelerName, setTravelerName] = useState('我');
  const [pace, setPace] = useState<'realtime' | 'event'>(() => new URLSearchParams(window.location.search).get('pace') === 'event' ? 'event' : 'realtime');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Point[]>([]);
  const [busy, setBusy] = useState(false);
  const [posterBusy, setPosterBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<'journey' | 'route' | 'book'>('journey');
  const [momentMenuOpen, setMomentMenuOpen] = useState(false);
  const [bookPage, setBookPage] = useState(0);
  const [recentTrips, setRecentTrips] = useState<Array<{ id: string; destination: Point; status: string }>>([]);
  const [replayDay, setReplayDay] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const baseTrip = demo ? demoTrip : trip;
  const lastTravelDay = baseTrip?.spots.length ? Math.max(...baseTrip.spots.map(item => item.day)) : 0;
  const active = useMemo(() => {
    if (!baseTrip || replayDay === null) return baseTrip;
    const visibleSpots = baseTrip.spots.filter(item => item.day <= replayDay);
    const visibleSpotIds = new Set(visibleSpots.map(item => item.id));
    return {
      ...baseTrip,
      spots: visibleSpots,
      consequenceThreads: (baseTrip.consequenceThreads || []).filter(thread => visibleSpotIds.has(thread.originSpotId)).map(thread => {
        const history = thread.history.filter(item => visibleSpotIds.has(item.spotId));
        const latest = history.at(-1);
        return { ...thread, history, pending: latest?.remaining || thread.pending, status: latest?.remaining === null ? 'resolved' as const : 'open' as const };
      }),
      plan: baseTrip.plan.filter(leg => (leg.introducedDay || 1) <= replayDay).map(leg =>
        leg.resolvedDay && leg.resolvedDay > replayDay ? { ...leg, status: 'planned' as const, accessNotes: leg.planningNotes ?? leg.accessNotes } : leg),
      planRevision: visibleSpots.at(-1)?.planRevision || 1,
      currentDay: replayDay,
      status: replayDay < lastTravelDay ? 'active' as const : baseTrip.status,
      endedAt: replayDay < lastTravelDay ? null : baseTrip.endedAt,
    };
  }, [baseTrip, replayDay, lastTravelDay]);
  const spot = active?.spots.find(item => item.id === selectedSpot) || active?.spots.at(-1) || null;
  useEffect(() => setMomentMenuOpen(false), [spot?.id]);
  const failedPhotoCount = active?.spots.reduce((sum, item) => sum + item.photos.filter(p => p.status === 'failed').length, 0) || 0;
  const visibleStatusNote = active?.simulation ? null : active?.statusNote;
  const readyToDepart = photos.length >= 2 && chosen !== null && startingCompanions.every(person => person.name.trim() && person.photo);
  const latestTripId = useRef<string | null>(null);
  const latestTripStatus = useRef<Trip['status'] | null>(null);
  latestTripId.current = trip?.id || null;
  latestTripStatus.current = trip?.status || null;
  const activity = useTravelActivity(!demo && !trip?.simulation ? trip?.id || null : null, () => {
    if (latestTripId.current) void loadTrip(latestTripId.current);
  });
  async function retryActivity(task: ActivityTask) {
    const endpoint = task.kind === 'photo' ? 'photos/retry' : task.kind === 'book' ? 'book/retry' : 'retry';
    const response = await fetch(`/api/trips/${task.tripId}/${endpoint}`, { method: 'POST', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error((await response.json()).error || '重试失败');
    if (latestTripId.current === task.tripId) await loadTrip(task.tripId);
  }

  useEffect(() => {
    fetch('/api/trips').then(r => r.json()).then(rows => {
      setRecentTrips(rows);
      const requestedId = new URLSearchParams(window.location.search).get('trip');
      const requested = rows.find((item: { id: string }) => item.id === requestedId);
      if (new URLSearchParams(window.location.search).get('new') !== '1' && (requested || rows[0])) void loadTrip((requested || rows[0]).id);
    }).catch(() => {});
    const timer = window.setInterval(() => { if (latestTripId.current) void loadTrip(latestTripId.current); }, 10_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!replayPlaying || replayDay === null || !baseTrip) return;
    const timer = window.setInterval(() => {
      setReplayDay(day => day === null ? null : Math.min(lastTravelDay, day + 1));
      setSelectedSpot(null);
      setPanel('journey');
      setBookPage(0);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [replayPlaying, replayDay, baseTrip, lastTravelDay]);
  useEffect(() => {
    if (replayDay !== null && replayDay >= lastTravelDay) setReplayPlaying(false);
  }, [replayDay, lastTravelDay]);
  useEffect(() => {
    const urls = photos.map(file => URL.createObjectURL(file));
    setPhotoPreviewUrls(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [photos]);
  useEffect(() => {
    const urls = startingCompanions.map(person => person.photo ? URL.createObjectURL(person.photo) : '');
    setCompanionPreviews(urls);
    return () => urls.forEach(url => { if (url) URL.revokeObjectURL(url); });
  }, [startingCompanions]);
  async function loadTrip(id: string) {
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as Trip;
      const openingDifferentTrip = latestTripId.current !== id;
      const justEnded = latestTripStatus.current !== 'ended';
      if (openingDifferentTrip) { setReplayDay(null); setReplayPlaying(false); setSelectedSpot(null); }
      setTrip(data); setDemo(false); setError('');
      if (data.status === 'ended' && !data.simulation && (openingDifferentTrip || justEnded)) setPanel('book');
    } catch (cause) {
      setError(`打开旅程失败：${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  async function searchPlace() {
    if (search.trim().length < 2) return;
    setBusy(true); setError('');
    try { const response = await fetch(`/api/places/search?q=${encodeURIComponent(search.trim())}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setSearchResults(data); }
    catch (e) { setError(e instanceof Error ? e.message : '搜索失败'); }
    finally { setBusy(false); }
  }
  async function choosePoint(point: Point) {
    if (active) return;
    setChosen(point); setSearchResults([]); setError('');
    try { const response = await fetch(`/api/places/reverse?lat=${point.lat}&lon=${point.lon}`); if (response.ok) setChosen(await response.json()); } catch { /* coordinate is still usable */ }
  }
  async function randomPlace() {
    setBusy(true); setError('');
    try { const response = await fetch('/api/places/random'); const data = await response.json(); if (!response.ok) throw new Error(data.error); await choosePoint(data); }
    catch (e) { setError(e instanceof Error ? e.message : '随机定位失败'); }
    finally { setBusy(false); }
  }
  function addPhotos(incoming: File[]) {
    const result = mergeReferencePhotos(photos, incoming);
    setPhotos(result.files);
    setError(result.message || '');
  }
  function removePhoto(index: number) {
    setPhotos(current => current.filter((_, position) => position !== index));
    setError('');
  }
  async function begin() {
    if (!chosen || photos.length < 2) { setError('请先选择目的地，并上传至少两张自己的照片。'); return; }
    if (startingCompanions.some(person => !person.name.trim() || !person.photo)) { setError('请给每位出发前的旅伴填写称呼并上传照片。'); return; }
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('travelerName', travelerName.trim() || '我'); form.append('destination', JSON.stringify(chosen)); form.append('pace', pace);
      photos.forEach(file => form.append('photos', file));
      form.append('companions', JSON.stringify(startingCompanions.map(person => ({ name: person.name.trim() }))));
      startingCompanions.forEach(person => form.append('companionPhotos', person.photo!));
      const response = await fetch('/api/trips', { method: 'POST', body: form }); const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.history.replaceState(null, '', `?trip=${data.id}`);
      setTrip(data); setDemo(false); setPanel('journey');
    } catch (e) { setError(e instanceof Error ? e.message : '启动失败'); }
    finally { setBusy(false); }
  }
  async function retry() { if (trip) { await fetch(`/api/trips/${trip.id}/retry`, { method: 'POST' }); void loadTrip(trip.id); } }
  async function retryPhotos() {
    if (!trip) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/trips/${trip.id}/photos/retry`, { method: 'POST' });
      if (!response.ok) throw new Error('照片重试失败');
      await loadTrip(trip.id);
    } catch (e) { setError(e instanceof Error ? e.message : '照片重试失败'); }
    finally { setBusy(false); }
  }
  async function toggleTravelPause() {
    if (!trip) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/trips/${trip.id}/${trip.status === 'paused' ? 'resume' : 'pause'}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '无法更新旅行状态');
      await loadTrip(trip.id);
    } catch (e) { setError(e instanceof Error ? e.message : '无法更新旅行状态'); }
    finally { setBusy(false); }
  }
  async function endTrip() {
    if (!trip || !window.confirm('结束这次旅行并把沿途故事装订成册？')) return;
    setBusy(true); setError('');
    try { const response = await fetch(`/api/trips/${trip.id}/end`, { method: 'POST' }); if (!response.ok) throw new Error('结束旅程失败'); await loadTrip(trip.id); setPanel('book'); }
    catch (e) { setError(e instanceof Error ? e.message : '结束旅程失败'); }
    finally { setBusy(false); }
  }
  async function exportPoster() {
    if (!trip) return;
    setPosterBusy(true); setError('');
    try {
      const { createSharePoster } = await import('./sharePoster.js');
      const blob = await createSharePoster(trip);
      if (latestTripId.current !== trip.id) return;
      const response = await fetch(`/api/trips/${trip.id}/share-poster`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '分享图保存失败');
      setShareUrl(`${result.url}?v=${Date.now()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '分享图生成失败');
    } finally {
      setPosterBusy(false);
    }
  }
  function newJourney() { window.history.replaceState(null, '', window.location.pathname); setTrip(null); setDemo(false); setChosen(null); setPhotos([]); setStartingCompanions([]); setSelectedSpot(null); setPanel('journey'); setError(''); setReplayDay(null); setReplayPlaying(false); setShareUrl(null); }
  function startReplay() { setReplayDay(1); setReplayPlaying(true); setSelectedSpot(null); setPanel('journey'); setBookPage(0); }
  function stepReplay(delta: number) { setReplayPlaying(false); setReplayDay(day => Math.min(lastTravelDay, Math.max(1, (day || 1) + delta))); setSelectedSpot(null); setPanel('journey'); setBookPage(0); }
  const bookPages = useMemo(() => active ? [{ type: 'cover' as const }, ...active.spots.map((_, index) => ({ type: 'spot' as const, index })), ...(active.status === 'ended' ? [{ type: 'closing' as const }] : [])] : [], [active]);
  const currentPage = bookPages[Math.min(bookPage, bookPages.length - 1)];

  return <div className="app-shell">
    <header className="topbar">
      <button className="wordmark" onClick={newJourney} aria-label="返回首页"><span className="wordmark-icon">✳</span><span>在别处<span className="wordmark-dot">.</span></span></button>
      <span className="topbar-center">一个人工作，另一个你在世界上漫游</span>
      <div className="topbar-actions">
        {active && <span className="live-indicator"><span />{demo ? '体验预览' : active.simulation ? '12 天加速模拟' : baseTrip?.status === 'ended' ? '旅程已收藏' : baseTrip?.status === 'paused' ? '旅程已暂停' : baseTrip?.status === 'planning' ? '准备出发' : '旅程进行中'}</span>}
        {active && <button className="topbar-link" onClick={newJourney}>新的旅行 <ArrowUpRight size={16} /></button>}
        {!active && <span className="topbar-tag">AI FOR FUN · ELSEWHERE</span>}
      </div>
    </header>
    <main className="workspace">
      <section className="map-stage">
        <MapCanvas trip={active} chosen={chosen} onChoose={choosePoint} onSpot={item => { setSelectedSpot(item.id); setPanel('journey'); }} selectedSpot={selectedSpot} />
        <div className="map-wash" />
        <div className="map-paper-grain" aria-hidden="true" />
        <div className="atlas-compass" aria-hidden="true"><span>N</span><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" /><path className="compass-north" d="M32 5 39 32 32 27 25 32Z" /><path className="compass-south" d="M32 59 25 32 32 37 39 32Z" /><path d="M5 32h15m24 0h15M32 20v-6m0 30v6" /></svg><small>在别处 · 旅行图册</small></div>
        <div className="map-top-left"><div className="map-eyebrow"><Globe2 size={14} /> WORLD, UNFOLDING</div><div className="map-heading">旅途会自己<br /><em>长出新的方向。</em></div></div>
        {active ? <>
          <div className="map-location-pill"><LocateFixed size={16} /><div><small>{selectedSpot ? '正在回看' : active.status === 'ended' ? '旅程终点' : '此刻在'}</small><strong>{spot?.place.label || active.destination.label}</strong></div></div>
          <div className="route-legend"><span><i className="legend-actual" />旅途轨迹示意 · 非 GPS</span>{active.status !== 'ended' && <span><i className="legend-plan" />暂定方向</span>}</div>
          <button className="map-route-open" onClick={() => { setSelectedSpot(null); setPanel('route'); }}><Compass size={17} /> 打开完整路线 <ArrowRight size={16} /></button>
        </> : <div className="map-instruction"><MapPin size={16} /> 点击地图任意一点，或者把目的地交给随机</div>}
      </section>
      <aside className="story-stage">
        {!active ? <div className="onboarding">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR OTHER LIFE, STARTS HERE</div>
          <h1>你继续生活。<br /><em>让另一个你，</em><br />去看看世界。</h1>
          <p className="intro">把分身放出去。它会自己出发、改路、遇见人，留下照片和日记。你随时可以打开地图，看看此刻的它在哪里。</p>
          <div className="form-section"><div className="form-number">01</div><div className="form-body"><h3>让它认得你</h3><p>选 2–8 张能看清自己的照片，出发前可以逐张检查。</p><label className={`upload-box ${photos.length >= MAX_REFERENCE_PHOTOS ? 'full' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addPhotos(Array.from(event.dataTransfer.files)); }}><ImagePlus size={21} /><span>{photos.length >= MAX_REFERENCE_PHOTOS ? '已选满 8 张照片' : photos.length ? `已添加 ${photos.length} / ${MAX_REFERENCE_PHOTOS} 张 · 继续添加` : '选择照片，或拖到这里'}</span><small>JPG / PNG / WEBP · 单张 ≤ 12 MB</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={photos.length >= MAX_REFERENCE_PHOTOS} onChange={event => { addPhotos(Array.from(event.target.files || [])); event.target.value = ''; }} /></label>{photos.length > 0 && <div className="reference-grid">{photos.map((file, index) => <div className="reference-card" key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>{photoPreviewUrls[index] && <img src={photoPreviewUrls[index]} alt={`第 ${index + 1} 张外貌参考照片`} />}<span>{String(index + 1).padStart(2, '0')}</span><button onClick={() => removePhoto(index)} aria-label={`移除第 ${index + 1} 张照片`}><X size={12} /></button></div>)}</div>}<p className="reference-guidance">最好有一张清晰正面照，再补充不同角度和自然状态；不用给分身设置性格。</p><input className="name-input" value={travelerName} onChange={e => setTravelerName(e.target.value)} placeholder="给这位旅行者起个名字" aria-label="旅行者名称" /></div></div>
          <div className="form-section companion-section"><div className="form-number">＋</div><div className="form-body"><h3>带谁一起出发？</h3><p>可选。给出发前的同行者一张参考照片；路上还可能认识别人，也可能各走各的。</p>
            {startingCompanions.map((person, index) => <div className="companion-input" key={index}>
              <label className="companion-photo">{companionPreviews[index] ? <img src={companionPreviews[index]} alt={`${person.name || '旅伴'}的参考照片`} /> : <ImagePlus size={18} />}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`旅伴 ${index + 1} 的照片`} onChange={event => { const file = event.target.files?.[0] || null; setStartingCompanions(current => current.map((item, position) => position === index ? { ...item, photo: file } : item)); }} /></label>
              <input value={person.name} onChange={event => setStartingCompanions(current => current.map((item, position) => position === index ? { ...item, name: event.target.value } : item))} placeholder="怎么称呼 TA" aria-label={`旅伴 ${index + 1} 的称呼`} />
              <button onClick={() => setStartingCompanions(current => current.filter((_, position) => position !== index))} aria-label={`移除旅伴 ${index + 1}`}><X size={15} /></button>
            </div>)}
            <button className="add-companion" onClick={() => setStartingCompanions(current => [...current, { name: '', photo: null }])}>＋ 添加一位同行者</button>
          </div></div>
          <div className="form-section destination-section"><div className="form-number">02</div><div className="form-body"><h3>把第一站交给世界</h3><p>在地图上点一个地方、搜索城市，或者随机出发。</p><div className="search-row"><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && void searchPlace()} placeholder="搜索一个地名" aria-label="搜索地名" /><button onClick={() => void searchPlace()} aria-label="搜索" disabled={busy}><Search size={19} /></button></div>{searchResults.length > 0 && <div className="search-results">{searchResults.map((point, index) => <button key={index} onClick={() => void choosePoint(point)}><MapPin size={14} />{point.label}</button>)}</div>}<button className="random-link" onClick={() => void randomPlace()} disabled={busy}><Shuffle size={16} /> 随机降落在地球某处</button>{chosen && <div className="chosen-place"><Check size={16} /><span>{chosen.label}</span><button onClick={() => setChosen(null)} aria-label="取消目的地"><X size={14} /></button></div>}</div></div>
          <div className="travel-pace-selector"><h3>旅途的节奏</h3><div role="group" aria-label="旅行推进模式"><button className={pace === 'realtime' ? 'selected' : ''} onClick={() => setPace('realtime')} aria-pressed={pace === 'realtime'}><span>慢慢漫游</span><small>现实 1 小时，旅行 1 天</small></button><button className={pace === 'event' ? 'selected' : ''} onClick={() => setPace('event')} aria-pressed={pace === 'event'}><span>加速旅行</span><small>一站完成，立刻去下一站</small></button></div><p>{pace === 'event' ? '日记和整组照片送达后继续出发。每天两站，可随时暂停。' : '按时间自然推进，随时回来看看另一个你。'}</p></div>
          {error && <p className="error-note">{error}</p>}
          <div className="departure-check"><span className={photos.length >= 2 ? 'ready' : ''}><Check size={13} /> 至少 2 张照片</span><span className={chosen ? 'ready' : ''}><Check size={13} /> 已选第一站</span></div><button className="primary-button start-button" onClick={() => void begin()} disabled={busy || !readyToDepart}><span>{busy ? '正在准备…' : '放它出去旅行'}</span><ArrowUpRight size={20} /></button>
          <button className="preview-link" onClick={() => { setDemo(true); setPanel('journey'); }}><Play size={14} fill="currentColor" /> 先看看旅程会是什么样子 <span>示意内容</span></button>
          {recentTrips.length > 0 && <div className="recent-trips"><small>继续之前的旅程</small>{recentTrips.slice(0, 3).map(item => <button key={item.id} onClick={() => void loadTrip(item.id)}>{item.destination.label} <ArrowUpRight size={14} /></button>)}</div>}
        </div> : <div className="journey-panel">
          {active.simulation && <div className="simulation-banner">法罗群岛 · 12 天加速模拟　|　地点有据，经历与人物为创作，照片由 AI 生成；地图连线仅示意停靠顺序</div>}
          {active.experimentNote && <div className="simulation-banner">{active.experimentNote}</div>}
          {!demo && !active.simulation && replayDay === null && <TravelActivity trip={active} activity={activity} onRetry={retryActivity} />}
          {lastTravelDay > 1 && <div className="replay-controls">{replayDay === null ? <><span>从第一天开始，看这段旅程如何改变方向。</span><button onClick={startReplay}><Play size={15} fill="currentColor" /> 按日回看</button></> : <><span>DAY {String(replayDay).padStart(2, '0')} <i>/ {lastTravelDay}</i></span><div><button onClick={() => stepReplay(-1)} disabled={replayDay <= 1} aria-label="前一天"><ChevronLeft size={17} /></button><button onClick={() => setReplayPlaying(value => !value)} disabled={replayDay >= lastTravelDay} aria-label={replayPlaying ? '暂停回放' : '继续回放'}>{replayPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}</button><button onClick={() => stepReplay(1)} disabled={replayDay >= lastTravelDay} aria-label="后一天"><ChevronRight size={17} /></button><button className="replay-all" onClick={() => { setReplayPlaying(false); setReplayDay(null); setSelectedSpot(null); }}>查看全程</button></div></>}</div>}
          {!demo && !active.simulation && active.pace === 'event' && replayDay === null && <div className="travel-pace-status"><div><strong>加速旅行{active.status === 'paused' ? ' · 已暂停' : active.status === 'ended' ? ' · 已结束' : ''}</strong><small>{active.status === 'paused' ? '整组照片会继续送达，下一站等你决定。' : active.status === 'ended' ? '沿途的照片和故事已保存在本地。' : visibleStatusNote ? '这一站需要处理，自动推进暂时停下。' : '每站日记和照片完成后，自动继续。'}</small></div>{(active.status === 'active' || active.status === 'paused') && <button onClick={() => void toggleTravelPause()} disabled={busy}>{active.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}{active.status === 'paused' ? '继续' : '暂停'}</button>}</div>}
          <div className="panel-tabs"><button className={panel === 'journey' ? 'active' : ''} onClick={() => setPanel('journey')}>此刻</button><button className={panel === 'route' ? 'active' : ''} onClick={() => { setSelectedSpot(null); setPanel('route'); }}>路线</button><button className={panel === 'book' ? 'active' : ''} onClick={() => { setSelectedSpot(null); setPanel('book'); setBookPage(0); }}>游记</button></div>
          {panel === 'journey' && <div className="journey-content">
            <div className="wechat-navigation"><ChevronLeft size={22} /><strong>朋友圈</strong><Camera size={22} /></div>
            <div className="wechat-cover" style={{ backgroundImage: active.spots.at(-1)?.photos.find(photo => photo.status === 'ready')?.url ? `linear-gradient(0deg, rgba(0,0,0,.52), rgba(0,0,0,.05) 64%), url(${active.spots.at(-1)!.photos.find(photo => photo.status === 'ready')!.url})` : undefined }}><div className="wechat-cover-user"><strong>{active.travelerName}的另一段生活</strong><span>{active.travelerName.trim().slice(0, 1) || '我'}</span></div></div>
            {spot ? <article className="wechat-moment">
              <div className="wechat-avatar">{active.travelerName.trim().slice(0, 1) || '我'}</div>
              <div className="wechat-body">
                <strong className="wechat-name">{active.travelerName}的另一段生活</strong>
                <p className="wechat-copy"><b>{spot.title}</b><br />{spot.diary}</p>
                <SpotPhotos key={spot.id} spot={spot} emptyLabel={spot.photos.some(photo => photo.status === 'failed') ? '照片生成失败，等待重试' : '照片正在生成'} />
                <MomentLocation place={spot.place} />
                <div className="wechat-meta"><span>DAY {String(spot.day).padStart(2, '0')} · {new Date(spot.happenedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><button className="wechat-more" aria-label="这条动态的操作" onClick={() => setMomentMenuOpen(value => !value)}>··</button></div>
                {momentMenuOpen && <div className="wechat-action-menu"><button disabled={!spot.photos.some(photo => photo.status === 'ready')} onClick={() => { setMomentMenuOpen(false); void downloadMomentPoster(spot, active.travelerName).catch(err => setError(err instanceof Error ? err.message : String(err))); }}><Download size={15} />保存这条朋友圈图片</button></div>}
                {spot.event && <div className="wechat-comments"><span className="wechat-comment-arrow">◆</span><p><strong>旅途插曲：</strong>{spot.event}</p>{spot.consequence && <p><strong>后来的事：</strong>{spot.consequence}</p>}</div>}
                <CompanionNotes spot={spot} />
              </div>
            </article> : <div className="wechat-waiting"><div className="wechat-avatar">{active.travelerName.trim().slice(0, 1) || '我'}</div><div><strong>{active.travelerName}的另一段生活</strong><p>{active.status === 'planning' ? '正在为你寻找第一条路。Codex 正在核实地点与交通，初次规划可能需要几分钟。' : '旅程刚刚开始。下一条动态会自动出现。'}</p></div></div>}
            {spot && <details className="moment-extra"><summary>这一站的行程细节</summary><div className="spot-details"><div><small>这一段怎么走</small><strong>{spot.transport}</strong></div><div><small>今晚落脚</small><strong>{spot.stay}</strong></div><div><small>遇见的人</small><strong>{spot.people.join('、') || '旅途中的自己'}</strong></div></div>{spot.sourceUrl?.startsWith('https://') && <a className="place-source" href={spot.sourceUrl} target="_blank" rel="noreferrer">查看这一站的地点资料 <ArrowUpRight size={13} /></a>}</details>}
            {spot && active.spots.slice(0, active.spots.findIndex(item => item.id === spot.id)).reverse().map(item => <article className="wechat-moment wechat-older" key={item.id}>
              <div className="wechat-avatar">{active.travelerName.trim().slice(0, 1) || '我'}</div><div className="wechat-body"><strong className="wechat-name">{active.travelerName}的另一段生活</strong><p className="wechat-copy"><b>{item.title}</b><br />{item.diary}</p><SpotPhotos spot={item} /><MomentLocation place={item.place} /><div className="wechat-meta"><span>DAY {String(item.day).padStart(2, '0')} · {new Date(item.happenedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><button className="wechat-more" onClick={() => setSelectedSpot(item.id)} aria-label={`查看 DAY ${item.day} 的详情`}>··</button></div>{item.event && <div className="wechat-comments"><p><strong>旅途插曲：</strong>{item.event}</p>{item.consequence && <p><strong>后来的事：</strong>{item.consequence}</p>}</div>}<CompanionNotes spot={item} /></div>
            </article>)}
            {spot && (spot.continuityUpdates || []).length > 0 && <div className="continuity-note"><span>之前的事，今天有了回响</span>{spot.continuityUpdates!.map(update => { const origin = active.consequenceThreads?.find(thread => thread.id === update.threadId); return <div className="continuity-row" key={update.threadId}><p>{update.effect}</p>{origin && active.spots.some(item => item.id === origin.originSpotId) && <button onClick={() => setSelectedSpot(origin.originSpotId)}>回看 DAY {String(origin.originDay).padStart(2, '0')} 的起因 <ArrowUpRight size={12} /></button>}</div>; })}</div>}
            {spot?.id === active.spots.at(-1)?.id && (active.consequenceThreads || []).some(thread => thread.status === 'open') && <div className="continuity-note pending"><span>还在旅途中延续</span>{active.consequenceThreads!.filter(thread => thread.status === 'open').map(thread => <p key={thread.id}>{thread.pending}</p>)}</div>}
            {(visibleStatusNote || failedPhotoCount > 0) && <div className="status-note"><p>{visibleStatusNote || `还有 ${failedPhotoCount} 张照片需要重试。`}</p>{!demo && !active.simulation && failedPhotoCount > 0 && <button onClick={() => void retryPhotos()} disabled={busy}><RotateCcw size={14} /> 重试缺失照片</button>}{!demo && !active.simulation && active.status !== 'ended' && visibleStatusNote && !visibleStatusNote.startsWith('照片') && <button onClick={() => void retry()}><RotateCcw size={14} /> 重试这一段</button>}</div>}
            {error && <p className="error-note">{error}</p>}
            {active.spots.length > 1 && <div className="spot-jump"><span>沿途 {active.spots.length} 个停靠点</span><div>{active.spots.map((item, index) => <button className={item.id === spot?.id ? 'selected' : ''} key={item.id} onClick={() => setSelectedSpot(item.id)}>{String(index + 1).padStart(2, '0')}</button>)}</div></div>}
            {!demo && !active.simulation && (trip?.status === 'active' || trip?.status === 'paused') && replayDay === null && <button className="end-link" onClick={() => void endTrip()} disabled={busy}><BookOpen size={17} /> 结束这次旅行，装订成册 <ArrowRight size={16} /></button>}
            {demo && <div className="demo-disclaimer">这是示意旅程，展示页面与叙事方式。图片为插画示意，未使用真人照片。</div>}
          </div>}
          {panel === 'route' && <div className="route-panel"><div className="eyebrow"><span className="eyebrow-line" /> A PLAN, OPEN TO CHANGE</div><h2>计划只是出发时<br /><em>想象的一条线。</em></h2><p className="route-intro">发生过的事留在实线里。还没抵达的方向是虚线。每次改路，旧计划也会留下；还没去过的地方会继续被核实、重选。</p><div className="route-timeline"><div className="timeline-section-label">已经走过</div>{active.spots.length ? active.spots.map((item, index) => <button key={item.id} className="route-stop" onClick={() => { setSelectedSpot(item.id); setPanel('journey'); }}><span className="route-dot actual">{index + 1}</span><span><small>DAY {item.day} · {travelIcon(item.movement?.mode || item.transport)} {travelName(item.movement?.mode || item.transport)} · {durationLabel(item.movement?.durationMinutes)}</small><strong>{item.title}</strong><em>{item.place.label}</em>{item.branchReason && <b>↳ {item.branchReason}</b>}</span><ArrowUpRight size={17} /></button>) : <p className="route-empty">第一段脚印还在生成中。</p>}<div className="timeline-section-label upcoming">{active.status === 'ended' ? '没走完或被改写的方向' : '接下来的可能'}</div>{active.plan.filter(leg => leg.status !== 'visited').map(leg => <div key={leg.id} className={`route-stop future ${leg.status}`}><span className="route-dot">{leg.status === 'superseded' || leg.status === 'skipped' ? '×' : '·'}</span><span className="route-stop-body"><small>{leg.status === 'superseded' ? '被旅途改写' : leg.status === 'skipped' ? '这站没去成' : [leg.activity, leg.transport].filter(Boolean).join(' · ')}</small><strong>{leg.title.replace(/^(?:\d+\s*[·.、-]\s*)+/, '')}</strong><em>{leg.why}</em>{leg.resolutionNote && <span className="resolution-note">{leg.resolutionNote}</span>}{leg.localBasis && <span className="local-basis">{leg.localBasis}</span>}{leg.accessNotes && <span className="access-notes">{leg.accessNotes}</span>}{leg.sourceUrl?.startsWith('https://') && <a href={leg.sourceUrl} target="_blank" rel="noreferrer" className="route-source">地点资料 <ArrowUpRight size={12} /></a>}</span></div>)}</div></div>}

        </div>}
      </aside>
    </main>
    {active && panel === 'book' && <BookExperience trip={active} onClose={() => setPanel('journey')} activityPanel={!demo && !active.simulation && replayDay === null && (activity.snapshot?.tasks.some(task => task.status === 'running') || active.spots.some(item => item.photos.some(photo => photo.status === 'pending')) || active.statusNote || activity.connection === 'offline') ? <TravelActivity trip={active} activity={activity} onRetry={retryActivity} compact /> : undefined} />}
    <footer className="footer"><span>© ELSEWHERE · 在别处</span><span>{(active?.pace || pace) === 'event' ? '一段故事结束，下一段随即开始。' : '一小时，在另一个世界里是一整天。'}</span><span>地名数据 <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · MADE FOR THE IMPOSSIBLE EVERYDAY</span></footer>
    {shareUrl && trip && <div className="share-overlay" role="dialog" aria-modal="true" aria-label="分享图预览"><div className="share-dialog"><div className="share-dialog-top"><div><small>YOUR JOURNEY, READY TO SHARE</small><h2>这一路，已经可以带走。</h2></div><button onClick={() => setShareUrl(null)} aria-label="关闭分享图预览"><X size={20} /></button></div><img src={shareUrl} alt="旅程分享图预览" /><div className="share-dialog-actions"><span>竖版 PNG · 1080 × 1600</span><button onClick={() => void exportPoster()} disabled={posterBusy}>重新生成</button><a href={`/api/trips/${trip.id}/share-poster/download`}><Download size={16} /> 保存分享图</a></div></div></div>}
  </div>;
}

export default App;
