import { rpcOriginPattern } from '../../shared/chains.ts';

export async function requestRpcOrigins(urls: readonly string[]): Promise<boolean> {
  const origins = [
    ...new Set(
      urls.flatMap((value) => {
        const pattern = rpcOriginPattern(value);
        return pattern ? [pattern] : [];
      }),
    ),
  ];
  if (origins.length === 0) return true;
  const request = globalThis.chrome?.permissions?.request;
  if (!request) return true;
  try {
    return await request({ origins });
  } catch {
    return false;
  }
}
