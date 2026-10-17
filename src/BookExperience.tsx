import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, Download, Camera, X } from 'lucide-react';
import { bookFace, bookSpreadFaces } from './bookLayout.js';

type BookPhoto = { url: string; status: string; caption?: string };
type BookSpot = { day: number; place: { label: string; lat?: number; lon?: number }; title: string; diary: string; activity?: string; branchReason?: string | null; event: string | null; consequence: string | null; photos: BookPhoto[] };
type BookTrip = { id: string; travelerName: string; destination: { label: string }; spots: BookSpot[]; bookTitle: string | null; bookClosing: string | null; status: string };
const PAGE_W = 3.5;
const PAGE_H = 4;
const W = 1050;
const H = 1200;
const BOOK_FONT = '"PingFang SC", "Microsoft YaHei", sans-serif';

async function imageFrom(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
async function pageTexture(trip: BookTrip, index: number): Promise<THREE.CanvasTexture> {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const face = bookFace(index, trip.spots.length);
  const ink = '#30352f', blue = '#667267';
  ctx.fillStyle = '#fdfcf8'; ctx.fillRect(0, 0, W, H);
  for (let i=0;i<1900;i++) { ctx.fillStyle=i%3?'#736d6004':'#fff9';ctx.fillRect((i*3877)%W,(i*7213)%H,1+i%2,1); }
  const text = (value: string, x: number, y: number, width: number, height: number, size = 31, color = ink, family = BOOK_FONT) => {
    let lines: string[] = [], font=size;
    const wrap=()=>{
      ctx.font=`${font}px ${family}`;lines=[];let line='';
      for(const char of value){if(char==='\n'){lines.push(line);line='';continue;}if(ctx.measureText(line+char).width>width&&line){lines.push(line);line=char;}else line+=char;}
      if(line)lines.push(line);
    };
    wrap();while(lines.length*font*1.55>height&&font>25){font--;wrap();}
    ctx.fillStyle=color;const count=Math.floor(height/(font*1.55));
    lines.slice(0,count).forEach((line,i)=>ctx.fillText(i===count-1&&lines.length>count?line.slice(0,-1)+'…':line,x,y+i*font*1.55));
  };
  const print = (image: HTMLImageElement | null, x: number, y: number, w: number, h: number, caption='', tape=false) => {
    ctx.save();ctx.translate(x+w/2,y+h/2);ctx.translate(-w/2,-h/2);
    ctx.shadowColor='#25251e22';ctx.shadowBlur=12;ctx.shadowOffsetX=0;ctx.shadowOffsetY=5;
    ctx.fillStyle='#fff';ctx.fillRect(-10,-10,w+20,h+46);ctx.shadowColor='transparent';
    ctx.strokeStyle='#d8d6cf66';ctx.lineWidth=1;ctx.strokeRect(-10,-10,w+20,h+46);
    ctx.fillStyle='#e8e7e1';ctx.fillRect(0,0,w,h);
    if(image){const scale=Math.max(w/image.width,h/image.height);ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();ctx.drawImage(image,(w-image.width*scale)/2,(h-image.height*scale)/2,image.width*scale,image.height*scale);ctx.restore();}
    ctx.font=`21px ${BOOK_FONT}`;ctx.fillStyle='#767970';ctx.fillText(caption.slice(0,30),4,h+32);
    if(tape){ctx.save();ctx.translate(w*.46,-10);ctx.fillStyle='#e3decb70';ctx.fillRect(-w*.12,-15,w*.26,34);ctx.strokeStyle='#d2cab938';ctx.strokeRect(-w*.12,-15,w*.26,34);ctx.restore();}
    ctx.restore();
  };
  const footer = (label: string) => {ctx.fillStyle='#92958b';ctx.font='21px sans-serif';ctx.fillText(label,76,H-48);ctx.textAlign='right';ctx.fillText(String(Math.max(0,index)+1).padStart(2,'0'),W-76,H-48);ctx.textAlign='left';};
  const allReady = trip.spots.flatMap(spot=>spot.photos).filter(photo=>photo.status==='ready'&&photo.url);
  if(face.kind==='cover'){
    ctx.fillStyle='#4c5b50';ctx.fillRect(0,0,W,H);
    for(let x=0;x<W;x+=3){ctx.fillStyle='#f1e8cc0b';ctx.fillRect(x,0,1,H);}for(let y=0;y<H;y+=4){ctx.fillStyle='#172e2511';ctx.fillRect(0,y,W,1);}
    ctx.fillStyle='#dee8d7';ctx.font='25px sans-serif';ctx.fillText('ELSEWHERE  /  我的另一段生活',95,110);
    text(trip.bookTitle||`在别处 · ${trip.destination.label}`,95,288,W-195,280,72,'#f8f7ef',BOOK_FONT);
    const image=allReady[0]?await imageFrom(allReady[0].url):null;
    print(image,135,600,W-270,300,'一路留下的照片',true);
    ctx.fillStyle='#dee8d7';ctx.font=`24px ${BOOK_FONT}`;ctx.fillText(`${trip.travelerName} · ${trip.spots.length} 段足迹`,100,H-130);
  }else if(face.kind==='atlas'){
    text('把另一个自己，\n留在了远方。',80,170,W-160,240,57);
    const image=allReady[0]?await imageFrom(allReady[0].url):null;
    print(image,105,430,W-220,310,trip.destination.label,true);
    text('翻过这些纸页，就能想起当时的小事。',90,925,W-190,150,32,blue);
    footer('一段旅行 · 慢慢翻');
  }else if(face.kind==='entry'){
    const spot=trip.spots[face.spotIndex];
    const ready=spot.photos.filter(photo=>photo.status==='ready'&&photo.url).slice(0,9);
    const images=await Promise.all(ready.map(photo=>imageFrom(photo.url)));
    const leftCount=ready.length>=7?3:ready.length>=4?2:1;
    const place=spot.place.label.split(' · ')[0];
    ctx.fillStyle='#7b8b7e';ctx.font='24px sans-serif';ctx.fillText(`DAY ${String(spot.day).padStart(2,'0')}  /  ${place.slice(0,31)}`,76,104);
    if(face.side==='left'){
      const hero=images[0]||null;
      print(hero,90,190,W-180,leftCount===3?435:leftCount===2?535:600,ready[0]?.caption||place,true);
      if(leftCount===3){
        print(images[1],90,745,390,245,ready[1]?.caption||'');
        print(images[2],570,745,390,245,ready[2]?.caption||'');
      }else if(leftCount===2){
        print(images[1],90,830,390,230,ready[1]?.caption||'');
        text(spot.activity||spot.title,540,870,410,185,32,blue);
      }else{
        text(spot.activity||spot.title,90,950,W-180,150,36,blue);
      }
      footer(spot.branchReason?'计划改变了，旅途也继续。':'写在旅途中');
    }else{
      text(spot.title,77,208,W-160,160,58);
      const rest=images.slice(leftCount), count=rest.length;
      const columns=count>4?3:count===1?1:2;
      const rows=Math.ceil(count/columns);const gap=27;
      const photoHeight=count>4?350:count>2?420:320;
      const cellW=(W-180-gap*(columns-1))/columns;
      const cellH=rows?(photoHeight-gap*(rows-1))/rows:0;
      rest.forEach((image,i)=>{
        const row=Math.floor(i/columns),col=i%columns;
        print(image,88+col*(cellW+gap),360+row*(cellH+gap),cellW-14,cellH-37,'');
      });
      const diaryY=count?430+photoHeight:390;
      const note=spot.event||spot.consequence;
      text(spot.diary,80,diaryY,W-170,H-diaryY-(note?190:125),34);
      if(note){ctx.fillStyle='#ae795e';ctx.fillRect(80,H-170,4,70);text(note,100,H-148,W-185,85,27,'#946348');}
      footer(`这一站 · ${ready.length} 张照片`);
    }
  }else{
    if(face.side==='left'){
      const image=allReady.at(-1)?await imageFrom(allReady.at(-1)!.url):null;
      print(image,105,210,W-220,470,'最后一张照片。',true);
      text('没有把世界走完。\n倒也不急。',95,875,W-190,170,46,blue);
      footer('收起这一次旅行');
    }else{
      ctx.font='25px sans-serif';ctx.fillStyle='#7f8c78';ctx.fillText('暂时翻到这里',85,135);
      text(trip.bookClosing||'每一站都留在了地图上。',85,315,W-180,690,38);
      footer('下次，再去别处');
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}

export function BookExperience({ trip, onClose, activityPanel }: { trip: BookTrip; onClose: () => void; activityPanel?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const textureCache = useRef(new Map<string, Promise<THREE.CanvasTexture>>());
  const flip = useRef<((direction: 1 | -1) => void) | null>(null);
  const [page, setPage] = useState(0);
  const [inspect, setInspect] = useState(false);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const lastPage = trip.spots.length + 1;
  const contentSignature = JSON.stringify([trip.bookTitle, trip.bookClosing, trip.spots.map(spot => [spot.title, spot.diary, spot.event, spot.photos.map(photo => [photo.status, photo.url])])]);
  const textureFor = (index: number) => {
    const bounded = Math.max(-1, Math.min(lastPage * 2, index));
    const key = JSON.stringify([bounded, contentSignature]);
    let pending = textureCache.current.get(key);
    if (!pending) { pending = pageTexture(trip, bounded); textureCache.current.set(key, pending); }
    return pending;
  };
  useEffect(() => {
    return () => { for (const pending of textureCache.current.values()) void pending.then(texture => texture.dispose()); textureCache.current.clear(); };
  }, [trip.id, contentSignature]);
  useEffect(() => {
    // Keep neighboring sheets ready without rasterizing an entire long trip at once.
    const lower = Math.max(-1, page * 2 - 5), upper = Math.min(lastPage * 2, page * 2 + 6);
    for (let index = lower; index <= upper; index++) void textureFor(index);
    for (const [key, pending] of textureCache.current) {
      const index = JSON.parse(key)[0] as number;
      if (index < lower || index > upper) { textureCache.current.delete(key); void pending.then(texture => texture.dispose()); }
    }
  }, [trip.id, contentSignature, page, lastPage]);
  useEffect(() => {
    if (!host.current) return;
    let dead = false;
    let frame = 0;
    const canvasCleanups: Array<() => void> = [];
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-4, 4, 2.5, -2.5, .1, 100);
    camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    host.current.appendChild(renderer.domElement);
    const ambient = new THREE.AmbientLight(0xffffff, 1.7); scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 1.55); key.position.set(-3.4, 5.5, 9); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 5; key.shadow.camera.bottom = -5; key.shadow.radius = 3; key.shadow.bias = -.0003; key.shadow.normalBias = .012; scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, .55); fill.position.set(4, -3, 5); scene.add(fill);
    const boardMaterial = new THREE.MeshStandardMaterial({ color: '#566154', roughness: 1 });
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W + .025, PAGE_H + .035, .13), boardMaterial);
      board.position.set(side * PAGE_W / 2, 0, -.11); board.rotation.z = 0; board.receiveShadow = true; scene.add(board);
      for (let leaf = 0; leaf < 7; leaf++) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W - .06, PAGE_H - .06, .006), new THREE.MeshStandardMaterial({ color: leaf % 2 ? '#e4e1d8' : '#fdfcf8', roughness: 1 }));
        edge.position.set(side * (PAGE_W / 2 + (leaf % 3) * .002), 0, -.035 + leaf * .008);
        scene.add(edge);
      }
    }
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, PAGE_H - .02, 16), new THREE.MeshStandardMaterial({ color: '#535d50', roughness: .95 }));
    spine.position.set(0, 0, -.12); scene.add(spine);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.ShadowMaterial({ opacity: .075 }));
    shadow.position.set(0, -.08, -.28); shadow.receiveShadow = true; scene.add(shadow);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [boardMaterial, spine.material, shadow.material];
    const textures: THREE.Texture[] = [];
    const pages: THREE.Mesh[] = [];
    const contactCanvas = document.createElement('canvas'); contactCanvas.width = 512; contactCanvas.height = 320;
    const contactCtx = contactCanvas.getContext('2d')!;
    contactCtx.shadowColor = '#25251e66'; contactCtx.shadowBlur = 18; contactCtx.shadowOffsetY = 4;
    contactCtx.fillStyle = '#25251e'; contactCtx.fillRect(38, 34, 436, 252);
    const contactTexture = new THREE.CanvasTexture(contactCanvas); textures.push(contactTexture);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(8.22, 5.08), new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, opacity: .42 }));
    contact.position.set(0, 0, -.30); scene.add(contact);

    const gutterTexture = (side: 'left' | 'right') => {
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 4;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, 256, 0);
      if (side === 'right') {
        gradient.addColorStop(0, 'rgba(52,48,40,.14)');
        gradient.addColorStop(.035, 'rgba(52,48,40,.07)');
        gradient.addColorStop(.065, 'rgba(55,44,31,0)');
      } else {
        gradient.addColorStop(.935, 'rgba(55,44,31,0)');
        gradient.addColorStop(.965, 'rgba(52,48,40,.07)');
        gradient.addColorStop(1, 'rgba(52,48,40,.14)');
      }
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 4);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture); return texture;
    };
    const leftGutter = gutterTexture('left');
    const rightGutter = gutterTexture('right');
    const reliefCanvas = document.createElement('canvas'); reliefCanvas.width = 256; reliefCanvas.height = 256;
    const reliefCtx = reliefCanvas.getContext('2d')!;
    reliefCtx.fillStyle = '#898989'; reliefCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i++) {
      const x = (i * 2297) % 256; const y = (i * 3253) % 256;
      reliefCtx.fillStyle = i % 2 ? '#989898' : '#777777';
      reliefCtx.fillRect(x, y, 1 + i % 2, 1);
    }
    const paperRelief = new THREE.CanvasTexture(reliefCanvas); paperRelief.wrapS = paperRelief.wrapT = THREE.RepeatWrapping; paperRelief.repeat.set(3, 4); textures.push(paperRelief);
    const addPage = (texture: THREE.Texture, x: number, z: number) => {
      const geometry = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 80, 20);
      const material = new THREE.MeshStandardMaterial({ map: texture, bumpMap: paperRelief, bumpScale: .0015, side: THREE.DoubleSide, roughness: .98, metalness: 0 });
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, 0, z); mesh.castShadow = true; mesh.receiveShadow = true;
      const gutterMaterial = new THREE.MeshBasicMaterial({ map: x < 0 ? leftGutter : rightGutter, transparent: true, depthWrite: false, side: THREE.FrontSide });
      const gutter = new THREE.Mesh(geometry, gutterMaterial); gutter.position.z = .003; mesh.add(gutter);
      geometries.push(geometry); materials.push(material); pages.push(mesh); scene.add(mesh); return mesh;
    };
    const setSize = () => {
      if (!host.current) return;
      const { width, height } = host.current.getBoundingClientRect();
      renderer.setSize(width, height);
      const aspect = width / Math.max(height, 1), mobile = width < 650;
      const halfHeight = Math.max(mobile ? 2.3 : 2.35, (mobile ? PAGE_W * .56 : PAGE_W * 1.1) / aspect);
      const center = mobile ? PAGE_W / 2 : 0;
      // A perpendicular orthographic view keeps both paper pages square to the screen.
      // The page mesh still bends in depth while dragging and casts real turn shadows.
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
      camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.position.set(center, 0, 10); camera.lookAt(center, 0, 0);
      camera.updateProjectionMatrix(); renderer.render(scene, camera);
    };
    const resize = new ResizeObserver(setSize); resize.observe(host.current);
    const faces = bookSpreadFaces(page);
    Promise.all([textureFor(faces.backwardLeft), textureFor(faces.backwardBack), textureFor(faces.left), textureFor(faces.right), textureFor(faces.forwardBack), textureFor(faces.nextRight)]).then(([previousTexture, previousRightTexture, leftTexture, rightTexture, nextLeftTexture, nextTexture]) => {
      if (dead) return;
      const leftUnder = addPage(leftTexture, -PAGE_W / 2, .028);
      const rightUnder = addPage(nextTexture, PAGE_W / 2, .028);
      const rightTurn = addPage(rightTexture, PAGE_W / 2, .052);
      const leftTurn = addPage(leftTexture, -PAGE_W / 2, .055);
      leftTurn.visible = false;
      for (const [turn, sourceTexture] of [[rightTurn, nextLeftTexture], [leftTurn, previousRightTexture]] as const) {
        const backTexture = sourceTexture.clone();
        backTexture.wrapS = THREE.RepeatWrapping;
        backTexture.repeat.x = -1;
        backTexture.offset.x = 1;
        backTexture.needsUpdate = true;
        textures.push(backTexture);
        const paperBackMaterial = new THREE.MeshStandardMaterial({ map: backTexture, bumpMap: paperRelief, bumpScale: .0015, side: THREE.BackSide, roughness: 1 });
        materials.push(paperBackMaterial);
        (turn.material as THREE.MeshStandardMaterial).side = THREE.FrontSide;
        const back = new THREE.Mesh(turn.geometry, paperBackMaterial);
        back.position.copy(turn.position); back.visible = turn.visible; back.castShadow = true; pages.push(back); scene.add(back);
        turn.userData.back = back;
      }
      const initial = rightTurn.geometry.attributes.position as THREE.BufferAttribute;
      const rightPoints = Array.from({ length: initial.count }, (_, i) => [initial.getX(i), initial.getY(i)] as const);
      const leftPoints = [...rightPoints];
      let progress = 0; let target = 0; let velocity = 0; let direction: 1 | -1 = 1;
      let dragging = false; let startX = 0; let moved = false;
      const reset = () => { leftTurn.visible = false; leftTurn.userData.back.visible = false; rightTurn.visible = true; rightTurn.userData.back.visible = true; (leftUnder.material as THREE.MeshStandardMaterial).map = leftTexture; (rightUnder.material as THREE.MeshStandardMaterial).map = nextTexture; };
      const prepare = (nextDirection: 1 | -1) => {
        if (target !== 0 || progress > .01 || dragging) return false;
        if (nextDirection === 1 && page >= lastPage || nextDirection === -1 && page <= 0) return false;
        direction = nextDirection;
        rightTurn.visible = nextDirection === 1; rightTurn.userData.back.visible = nextDirection === 1;
        leftTurn.visible = nextDirection === -1; leftTurn.userData.back.visible = nextDirection === -1;
        (leftUnder.material as THREE.MeshStandardMaterial).map = nextDirection === -1 ? previousTexture : leftTexture;
        (rightUnder.material as THREE.MeshStandardMaterial).map = nextDirection === -1 ? rightTexture : nextTexture;
        (leftUnder.material as THREE.MeshStandardMaterial).needsUpdate = true;
        (rightUnder.material as THREE.MeshStandardMaterial).needsUpdate = true;
        return true;
      };
      flip.current = (nextDirection) => { if (prepare(nextDirection)) target = 1; };
      const canvas = renderer.domElement;
      const down = (event: PointerEvent) => {
        if (event.button !== 0) return;
        const rect = canvas.getBoundingClientRect();
        const middle = rect.left + rect.width / 2;
        const nextDirection = canvas.clientWidth < 650 ? (page >= lastPage ? -1 : 1) : event.clientX >= middle ? 1 : -1;
        if (!prepare(nextDirection)) return;
        dragging = true; moved = false; startX = event.clientX; target = 0; velocity = 0;
        canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing';
      };
      const move = (event: PointerEvent) => {
        if (!dragging) return;
        if (canvas.clientWidth < 650 && direction === 1 && page > 0 && event.clientX - startX > 10 && progress < .01) {
          direction = -1;
          rightTurn.visible = false; rightTurn.userData.back.visible = false;
          leftTurn.visible = true; leftTurn.userData.back.visible = true;
          (leftUnder.material as THREE.MeshStandardMaterial).map = previousTexture;
          (rightUnder.material as THREE.MeshStandardMaterial).map = rightTexture;
          (leftUnder.material as THREE.MeshStandardMaterial).needsUpdate = true;
          (rightUnder.material as THREE.MeshStandardMaterial).needsUpdate = true;
        }
        const delta = direction === 1 ? startX - event.clientX : event.clientX - startX;
        if (Math.abs(delta) > 5) moved = true;
        progress = Math.max(0, Math.min(.985, delta / (canvas.clientWidth * .37)));
        velocity = 0;
      };
      const up = (event: PointerEvent) => {
        if (!dragging) return;
        dragging = false; canvas.style.cursor = 'grab';
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        target = progress > .23 || (!moved && progress === 0) ? 1 : 0;
      };
      canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      const tick = () => {
        if (dead) return;
        if (!dragging) {
          const acceleration = (target - progress) * .052 - velocity * .18;
          velocity += acceleration; progress = Math.max(0, Math.min(1, progress + velocity));
        }
        const angle = Math.PI * progress;
        const turning = direction === 1 ? rightTurn : leftTurn;
        const attribute = turning.geometry.attributes.position as THREE.BufferAttribute;
        const points = direction === 1 ? rightPoints : leftPoints;
        for (let i = 0; i < points.length; i++) {
          const [x, y] = points[i];
          const radius = direction === 1 ? x + PAGE_W / 2 : PAGE_W / 2 - x;
          const fromSpine = radius / PAGE_W;
          // The outer edge leads the inner edge into the curl, as in turngl (MIT).
          const edgeLead = .28;
          const localProgress = Math.max(0, Math.min(1, progress * (1 + edgeLead) - edgeLead * .5 + (fromSpine - .5) * edgeLead));
          const localAngle = Math.PI * localProgress;
          const curl = Math.sin(Math.PI * fromSpine) * Math.sin(angle) * (.23 + .12 * Math.sin(Math.PI * progress));
          const outX = direction === 1 ? radius * Math.cos(localAngle) - PAGE_W / 2 : PAGE_W / 2 - radius * Math.cos(localAngle);
          const outZ = radius * Math.sin(localAngle) * .72 + curl + .08 * Math.sin(Math.PI * (y / PAGE_H + .5)) * Math.sin(angle);
          attribute.setXYZ(i, outX, y, outZ);
        }
        attribute.needsUpdate = true; turning.geometry.computeVertexNormals();
        renderer.render(scene, camera);
        if (target === 1 && progress > .995) { flip.current = null; setPage(value => value + direction); return; }
        if (target === 0 && progress < .005 && !dragging && direction === -1) reset();
        frame = requestAnimationFrame(tick);
      };
      tick();
      canvasCleanups.push(() => { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); });
    });
    setSize();
    return () => { dead = true; flip.current = null; cancelAnimationFrame(frame); canvasCleanups.forEach(clean => clean()); resize.disconnect(); const allGeometry = new Set<THREE.BufferGeometry>(); const allMaterial = new Set<THREE.Material>(); scene.traverse(object => { if (object instanceof THREE.Mesh) { allGeometry.add(object.geometry); const used = Array.isArray(object.material) ? object.material : [object.material]; used.forEach(material => allMaterial.add(material)); } }); allGeometry.forEach(geometry => geometry.dispose()); allMaterial.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose()); renderer.dispose(); renderer.domElement.remove(); };
  }, [trip.id, page, lastPage, contentSignature]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (photoIndex !== null) setPhotoIndex(null); else if (inspect) setInspect(false); else onClose(); } if (!inspect && event.key === 'ArrowRight') flip.current?.(1); if (!inspect && event.key === 'ArrowLeft') flip.current?.(-1); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onClose, inspect, photoIndex]);
  return <div className="book-experience" role="dialog" aria-modal="true" aria-label="全屏游记相册">
    <div className="book-experience-top"><div><small>ELSEWHERE · 旅行手账</small><strong>{trip.bookTitle || `在别处 · ${trip.destination.label}`}</strong></div><button onPointerDown={onClose} onClick={onClose} aria-label="关闭相册"><X size={22} /></button></div>
    {activityPanel}
    <div className="book-experience-stage"><div ref={host} className="book-webgl" aria-label="可翻页的 WebGL 相册" /><div className="book-stage-caption">拖动纸页，慢慢翻过这段旅行。</div></div>
    <div className="book-experience-controls"><button disabled={page <= 0} onClick={() => flip.current?.(-1)}><ChevronLeft size={21} />上一页</button><span><i>{String(page + 1).padStart(2, '0')}</i> / {String(lastPage + 1).padStart(2, '0')}<small>{page === 0 ? '封面' : page === lastPage ? '终章' : `DAY ${trip.spots[page - 1].day} · ${trip.spots[page - 1].place.label}`}</small></span><button disabled={page >= lastPage} onClick={() => flip.current?.(1)}>下一页<ChevronRight size={21} /></button></div>
    {page > 0 && page <= trip.spots.length && <button className="book-inspect" onClick={() => { setInspect(true); setPhotoIndex(null); }}><Camera size={16} />这一页的照片与日记</button>}
    {inspect && page > 0 && page <= trip.spots.length && <div className="book-photo-desk" role="dialog" aria-modal="true" aria-label="这一站的照片与日记"><button className="book-desk-close" onClick={() => {setInspect(false);setPhotoIndex(null);}} aria-label="放回相册"><X size={22}/></button><div className="book-desk-body"><small>DAY {trip.spots[page - 1].day} · {trip.spots[page - 1].place.label}</small><h2>{trip.spots[page - 1].title}</h2><div className="book-loose-photos">{trip.spots[page - 1].photos.filter(photo => photo.status === 'ready' && photo.url).map((photo,index) => <button key={photo.url} onClick={() => setPhotoIndex(index)} aria-label={`放大第 ${index+1} 张照片`}><img src={photo.url} alt={photo.caption || trip.spots[page - 1].title}/><span>{photo.caption || '旅途中的一张照片'}</span></button>)}</div><p>{trip.spots[page - 1].diary}</p>{trip.spots[page - 1].event && <p className="book-desk-event">{trip.spots[page - 1].event}</p>}{trip.spots[page - 1].consequence && <p className="book-desk-event">{trip.spots[page - 1].consequence}</p>}</div>{photoIndex !== null && <div className="book-print-view" onClick={() => setPhotoIndex(null)}><button onClick={() => setPhotoIndex(null)}>放回照片</button><img src={trip.spots[page - 1].photos.filter(photo => photo.status === 'ready' && photo.url)[photoIndex]?.url} alt="放大的旅途照片"/></div>}</div>}
    {trip.status === 'ended' && <a className="book-experience-export" href={`/api/trips/${trip.id}/export`}><Download size={15} /> 导出原图与故事</a>}
  </div>;
}
