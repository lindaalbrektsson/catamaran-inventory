import { unstable_rethrow } from 'next/navigation';
// Keep the form mounted after transport errors. Next redirects/auth navigation
// still escape to the router. No retry, timeout or new request is created here.
export async function recoverUpload<T>(operation: () => Promise<T>, failure: T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    unstable_rethrow(error);
    return failure;
  }
}
