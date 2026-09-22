import { processUploadImage } from './image-processing-client';
export async function processReceiptImage(selected: File): Promise<File> {
  try {
    return await processUploadImage(selected, 'receipt');
  } catch {
    throw new Error('RECEIPT_INVALID');
  }
}
