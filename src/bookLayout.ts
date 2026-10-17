export function bookSpreadFaces(spread: number) {
  const right = spread * 2;
  return { left: right - 1, right, forwardBack: right + 1, nextRight: right + 2, backwardLeft: right - 3, backwardBack: right - 2 };
}

export function bookFace(index: number, spots: number):
  { kind: 'atlas' | 'cover' | 'closing'; side?: 'left' | 'right' } |
  { kind: 'entry'; spotIndex: number; side: 'left' | 'right' } {
  if (index < 0) return { kind: 'atlas' };
  if (index === 0) return { kind: 'cover' };
  if (index > spots * 2) return { kind: 'closing', side: index % 2 ? 'left' : 'right' };
  return { kind: 'entry', spotIndex: Math.floor((index - 1) / 2), side: index % 2 ? 'left' : 'right' };
}
