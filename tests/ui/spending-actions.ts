export async function uploadReceipt(_previous: unknown, form: FormData) {
  const file = form.get('receipt') as File;
  sessionStorage.setItem(
    'receipt-upload-fixture',
    JSON.stringify({ size: file.size, type: file.type, id: form.get('requestId') }),
  );
  if (new URLSearchParams(location.search).has('slow'))
    await new Promise((resolve) => setTimeout(resolve, 20000));
  return { error: 'RECEIPT_UPLOAD_INCOMPLETE' as const };
}
