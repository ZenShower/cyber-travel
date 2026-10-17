const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function validReferenceImage(mime: string, data: Buffer): boolean {
  if (mime === 'image/png') return data.length >= 24 && data.subarray(0, 8).equals(png);
  if (mime === 'image/jpeg') return data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mime === 'image/webp') return data.length >= 16 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
