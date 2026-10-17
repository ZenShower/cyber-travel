type MomentPhoto = { url: string; caption: string; status: string };
type MomentSpot = { day: number; place: { label: string }; title: string; diary: string; event: string | null; photos: MomentPhoto[] };

function wrap(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  let line = '';
  let count = 0;
  for (const character of text) {
    if (context.measureText(line + character).width > maxWidth && line) {
      context.fillText(line, x, y + count * lineHeight);
      line = character;
      count += 1;
      if (count === maxLines) return;
    } else line += character;
  }
  if (line && count < maxLines) context.fillText(line, x, y + count * lineHeight);
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export async function downloadMomentPoster(spot: MomentSpot, travelerName: string): Promise<void> {
  const photos = spot.photos.filter(photo => photo.status === 'ready' && photo.url).slice(0, 9);
  if (!photos.length) throw new Error('这一站还没有可以导出的照片');
  const count = photos.length;
  const columns = count >= 5 ? 3 : count >= 2 ? 2 : 1;
  const rows = Math.ceil(count / columns);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1710;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建分享图');
  context.fillStyle = '#f6f3ed'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff'; context.fillRect(54, 42, 972, canvas.height - 84);
  context.fillStyle = '#e37558'; context.beginPath(); context.arc(126, 132, 43, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#ffffff'; context.font = 'bold 37px sans-serif'; context.textAlign = 'center'; context.fillText((travelerName.trim()[0] || '我'), 126, 145); context.textAlign = 'left';
  context.fillStyle = '#29483e'; context.font = 'bold 34px sans-serif'; context.fillText(travelerName || '我的赛博分身', 195, 125);
  context.fillStyle = '#8d9a91'; context.font = '23px sans-serif'; context.fillText(`DAY ${String(spot.day).padStart(2, '0')}  ·  在别处`, 195, 163);
  context.fillStyle = '#2a463c'; context.font = 'bold 39px serif'; wrap(context, spot.title, 96, 254, 880, 52, 2);
  context.fillStyle = '#587365'; context.font = '26px sans-serif'; wrap(context, spot.diary, 96, 367, 880, 40, 4);
  const top = 540;
  const width = 888;
  const gap = 9;
  const cell = (width - (columns - 1) * gap) / columns;
  const gridHeight = Math.min(rows * cell + (rows - 1) * gap, canvas.height - top - 200);
  const images = await Promise.all(photos.map(photo => loadImage(photo.url)));
  context.fillStyle = '#e6e9e2'; context.fillRect(96, top, width, gridHeight);
  images.forEach((image, index) => {
    if (!image) return;
    const x = 96 + (index % columns) * (cell + gap);
    const y = top + Math.floor(index / columns) * (cell + gap);
    const scale = Math.max(cell / image.width, cell / image.height);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    context.save(); context.beginPath(); context.rect(x, y, cell, cell); context.clip();
    context.drawImage(image, x + (cell - imageWidth) / 2, y + (cell - imageHeight) / 2, imageWidth, imageHeight);
    context.restore();
  });
  context.fillStyle = '#d86d50'; context.font = '25px sans-serif';
  wrap(context, `⌖ ${spot.place.label}`, 96, canvas.height - 135, 880, 34, 2);
  context.fillStyle = '#8f9f92'; context.font = '19px sans-serif'; context.fillText('ELSEWHERE · 在别处 / 一段正在发生的旅行', 96, canvas.height - 74);
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `在别处_DAY${String(spot.day).padStart(2, '0')}_${spot.place.label.replace(/[\\/:*?"<>|]/g, '')}.png`;
  link.click();
}
