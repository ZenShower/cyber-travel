export const MAX_REFERENCE_PHOTOS = 8;
export const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;
const supported = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function mergeReferencePhotos(current: File[], incoming: File[]): { files: File[]; message: string | null } {
  const files = [...current];
  const skipped = { format: 0, size: 0, duplicate: 0, limit: 0 };
  const identities = new Set(files.map(file => `${file.name}\0${file.size}\0${file.lastModified}`));
  for (const file of incoming) {
    if (!supported.has(file.type)) { skipped.format += 1; continue; }
    if (file.size > MAX_REFERENCE_BYTES || file.size === 0) { skipped.size += 1; continue; }
    const identity = `${file.name}\0${file.size}\0${file.lastModified}`;
    if (identities.has(identity)) { skipped.duplicate += 1; continue; }
    if (files.length >= MAX_REFERENCE_PHOTOS) { skipped.limit += 1; continue; }
    files.push(file);
    identities.add(identity);
  }
  const reasons = [
    skipped.format && `${skipped.format} 张格式不支持`,
    skipped.size && `${skipped.size} 张为空或超过 12 MB`,
    skipped.duplicate && `${skipped.duplicate} 张已添加过`,
    skipped.limit && `最多只能上传 ${MAX_REFERENCE_PHOTOS} 张`,
  ].filter(Boolean);
  return { files, message: reasons.length ? `部分照片未加入：${reasons.join('、')}。` : null };
}
