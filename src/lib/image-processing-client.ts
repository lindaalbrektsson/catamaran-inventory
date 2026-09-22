import { MAX_RECEIPT_BYTES } from './spending-domain';
import { documentLimit } from './document-domain';
export const imageProfiles = {
  receipt: {
    sourceLimit: 20 * 1024 * 1024,
    maxBytes: MAX_RECEIPT_BYTES,
    preferredBytes: 1.5 * 1024 * 1024,
    width: 2400,
    height: 4000,
    pixels: 40_000_000,
    quality: 0.85,
  },
  need: {
    sourceLimit: 30 * 1024 * 1024,
    maxBytes: 3 * 1024 * 1024,
    preferredBytes: 3 * 1024 * 1024,
    width: 3600,
    height: 4800,
    pixels: 64_000_000,
    quality: 0.9,
  },
  update: {
    sourceLimit: 20 * 1024 * 1024,
    maxBytes: 3 * 1024 * 1024,
    preferredBytes: 3 * 1024 * 1024,
    width: 3600,
    height: 4800,
    pixels: 40_000_000,
    quality: 0.9,
  },
  document: {
    sourceLimit: documentLimit,
    maxBytes: 5 * 1024 * 1024,
    preferredBytes: 5 * 1024 * 1024,
    width: 3600,
    height: 4800,
    pixels: 64_000_000,
    quality: 0.9,
  },
} as const;
export type ImageProfile = keyof typeof imageProfiles;

// Decoders disagree on PNG/WebP EXIF. Strip the tag before decode and apply
// its orientation once ourselves; JPEG orientation is supported natively.
function exifOrientation(bytes: Uint8Array, start: number, end: number): number {
  const view = new DataView(bytes.buffer);
  if (String.fromCharCode(...bytes.subarray(start, start + 4)) === 'Exif') start += 6;
  if (start + 8 > end) return 1;
  const little = bytes[start] === 0x49 && bytes[start + 1] === 0x49;
  const big = bytes[start] === 0x4d && bytes[start + 1] === 0x4d;
  if ((!little && !big) || view.getUint16(start + 2, little) !== 42) return 1;
  const dir = start + view.getUint32(start + 4, little);
  if (dir < start + 8 || dir + 2 > end) return 1;
  const count = view.getUint16(dir, little);
  for (let i = 0; i < count && dir + 2 + (i + 1) * 12 <= end; i++) {
    const entry = dir + 2 + i * 12;
    if (
      view.getUint16(entry, little) === 0x112 &&
      view.getUint16(entry + 2, little) === 3 &&
      view.getUint32(entry + 4, little) === 1
    ) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}
async function imageOrientation(file: File): Promise<{ source: Blob; orientation: number }> {
  if (!['image/webp', 'image/png'].includes(file.type)) return { source: file, orientation: 1 };
  const bytes = new Uint8Array(await file.arrayBuffer()),
    view = new DataView(bytes.buffer);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  const webp = file.type === 'image/webp';
  if (
    bytes.length < 12 ||
    (webp
      ? tag(0) !== 'RIFF' || tag(8) !== 'WEBP'
      : view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a)
  )
    return { source: file, orientation: 1 };
  for (let offset = webp ? 12 : 8; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + (webp ? 4 : 0), webp);
    const end = offset + 8 + size,
      next = end + (webp ? size % 2 : 4);
    if (next > bytes.length) break;
    if (tag(offset + (webp ? 0 : 4)) === (webp ? 'EXIF' : 'eXIf')) {
      const orientation = exifOrientation(bytes, offset + 8, end);
      if (webp) {
        // Unknown RIFF chunks are ignored; preserve container lengths and pixels.
        bytes.set([0x4a, 0x55, 0x4e, 0x4b], offset);
        return { source: new Blob([bytes], { type: file.type }), orientation };
      }
      // Remove the whole optional PNG chunk including its CRC. Other CRCs stay valid.
      return {
        source: new Blob([bytes.subarray(0, offset), bytes.subarray(next)], { type: file.type }),
        orientation,
      };
    }
    offset = next;
  }
  return { source: file, orientation: 1 };
}

// One shared browser transformation for every receipt entry point. Canvas strips
// metadata; createImageBitmap applies the camera orientation before resizing.
export async function processUploadImage(selected: File, profile: ImageProfile): Promise<File> {
  const config = imageProfiles[profile];
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) ||
    !selected.size ||
    selected.size > config.sourceLimit
  )
    throw new Error('IMAGE_INVALID');
  const { source, orientation } = await imageOrientation(selected);
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    if (bitmap.width * bitmap.height > config.pixels) throw new Error('IMAGE_INVALID');
    const swapped = orientation >= 5;
    const width = swapped ? bitmap.height : bitmap.width,
      height = swapped ? bitmap.width : bitmap.height;
    const scale = Math.min(1, config.width / width, config.height / height);
    const canvas = document.createElement('canvas');
    // Re-encode from the decoded source, never from the preceding JPEG attempt.
    for (const [resize, quality] of [
      [1, config.quality],
      [1, 0.78],
      [0.85, 0.78],
      [0.7, 0.75],
    ]) {
      canvas.width = Math.max(1, Math.round(width * scale * resize));
      canvas.height = Math.max(1, Math.round(height * scale * resize));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('IMAGE_INVALID');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const cw = canvas.width,
        ch = canvas.height;
      const transforms: Record<number, [number, number, number, number, number, number]> = {
        2: [-1, 0, 0, 1, cw, 0],
        3: [-1, 0, 0, -1, cw, ch],
        4: [1, 0, 0, -1, 0, ch],
        5: [0, 1, 1, 0, 0, 0],
        6: [0, 1, -1, 0, cw, 0],
        7: [0, -1, -1, 0, cw, ch],
        8: [0, -1, 1, 0, 0, ch],
      };
      if (transforms[orientation]) context.setTransform(...transforms[orientation]);
      context.drawImage(bitmap, 0, 0, swapped ? ch : cw, swapped ? cw : ch);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (
        blob &&
        blob.size > 0 &&
        blob.size <= config.maxBytes &&
        (blob.size <= config.preferredBytes || resize === 0.7)
      )
        return new File([blob], selected.name.replace(/\.[^.]*$/, '') + '.jpg', {
          type: 'image/jpeg',
        });
    }
    throw new Error('IMAGE_INVALID');
  } finally {
    bitmap.close();
  }
}

// One selected file produces stable bytes across form retries and shared entry points.
const optimized = new WeakMap<File, Partial<Record<ImageProfile, Promise<File>>>>();
export function optimizedImage(file: File, profile: ImageProfile): Promise<File> {
  const cached = optimized.get(file) ?? {};
  if (cached[profile]) return cached[profile]!;
  const promise = processUploadImage(file, profile).then((result) => {
    optimized.set(result, { [profile]: Promise.resolve(result) });
    return result;
  });
  cached[profile] = promise;
  optimized.set(file, cached);
  void promise.catch(() => {
    delete cached[profile];
  });
  return promise;
}
