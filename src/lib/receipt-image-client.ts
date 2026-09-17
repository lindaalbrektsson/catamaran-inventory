import { MAX_RECEIPT_BYTES } from './spending-domain';

// One shared browser transformation for every receipt entry point. Canvas strips
// metadata; createImageBitmap applies the camera orientation before resizing.
export async function processReceiptImage(selected: File): Promise<File> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) ||
    !selected.size ||
    selected.size > 20 * 1024 * 1024
  )
    throw new Error('RECEIPT_INVALID');
  const bitmap = await createImageBitmap(selected, { imageOrientation: 'from-image' });
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('RECEIPT_INVALID');
    const scale = Math.min(1, 2400 / bitmap.width, 4000 / bitmap.height);
    const canvas = document.createElement('canvas');
    // Re-encode from the decoded source, never from the preceding JPEG attempt.
    for (const [resize, quality] of [
      [1, 0.85],
      [1, 0.78],
      [0.85, 0.78],
      [0.7, 0.75],
    ]) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale * resize));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale * resize));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('RECEIPT_INVALID');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (
        blob &&
        blob.size <= MAX_RECEIPT_BYTES &&
        (blob.size <= 1.5 * 1024 * 1024 || resize === 0.7)
      )
        return new File([blob], 'receipt.jpg', { type: 'image/jpeg' });
    }
    throw new Error('RECEIPT_INVALID');
  } finally {
    bitmap.close();
  }
}
