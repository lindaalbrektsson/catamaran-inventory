export async function captureSimpleReceipt() {
  return { error: 'RECEIPT_UPLOAD_INCOMPLETE' as const };
}
export async function reverseStock(request: string, id: string) {
  sessionStorage.setItem('undo-fixture', JSON.stringify({ request, id }));
  return {};
}
export async function reviewReceipt(_previous: unknown, form: FormData) {
  sessionStorage.setItem('review-fixture', JSON.stringify(Object.fromEntries(form)));
  return { error: 'UNKNOWN' as const };
}
