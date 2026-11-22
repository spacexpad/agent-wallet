export const SOLANA_WALLET_WAIT_MS = 10_000;
export const SOLANA_WALLET_POLL_MS = 100;
export const SOLANA_WALLET_MISSING = 'No Solana wallet is available.';

export async function waitForSolanaWallet<T>(
  read: () => T | undefined,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? SOLANA_WALLET_WAIT_MS;
  const intervalMs = options?.intervalMs ?? SOLANA_WALLET_POLL_MS;
  const sleep = options?.sleep ?? delay;
  const now = options?.now ?? Date.now;
  const started = now();
  let current = read();
  while (!current && now() - started < timeoutMs) {
    await sleep(intervalMs);
    current = read();
  }
  if (!current) throw new Error(SOLANA_WALLET_MISSING);
  return current;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
