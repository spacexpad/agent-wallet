import { useEffect, useRef, useState } from 'react';
import { usePrivy, useSigners } from '@privy-io/react-auth';
import { t } from '../../shared/i18n.ts';
import { agentsNeedingGrant } from '../../shared/store.ts';
import type { Store } from '../../shared/types.ts';
import { runOfflineGrant } from '../lib/bindFlow.ts';
import { authPost, embeddedWalletId, ensureOwnerKey } from '../lib/offlineClient.ts';
import { updateStore } from '../lib/storage.ts';

export function AutoGrant({
  store,
  attempt,
  onError,
}: {
  store: Store;
  attempt: number;
  onError: (message: string | null) => void;
}) {
  const { user, authenticated } = usePrivy();
  const { addSigners } = useSigners();
  const solanaWalletId = embeddedWalletId(user, 'solana');
  const tried = useRef(new Set<string>());
  const failures = useRef(new Map<string, string>());
  const signing = store.offlineSigning;

  useEffect(() => {
    tried.current.clear();
    failures.current.clear();
    onError(null);
  }, [attempt, onError, signing]);

  useEffect(() => {
    const tokens = agentsNeedingGrant(store, { authenticated, solanaWalletId });
    for (const token of tokens) {
      if (tried.current.has(token)) continue;
      tried.current.add(token);
      void grantOne(token);
    }

    async function grantOne(token: string): Promise<void> {
      const solana = store.addresses?.solana;
      if (!solana || !solanaWalletId) return;
      try {
        await runOfflineGrant({
          store,
          token,
          userId: store.auth?.userId || user?.id || '',
          solanaAddress: solana,
          evmAddress: store.addresses?.evm ?? null,
          solanaWalletId,
          evmWalletId: embeddedWalletId(user, 'ethereum'),
          quorumId: store.settings.privyKeyQuorumId,
          addSigners,
          postAuth: authPost,
          ensureOwnerKey,
          updateStore,
        });
        failures.current.delete(token);
      } catch (reason) {
        failures.current.set(token, reason instanceof Error ? reason.message : t(store.language, 'vaultError'));
      }
      onError(failures.current.values().next().value ?? null);
    }
  }, [addSigners, attempt, authenticated, onError, solanaWalletId, store, user]);

  return null;
}

export function OfflineGrant({ store, token }: { store: Store; token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const granted = store.agents.some((agent) => agent.token === token && agent.offlineGranted);
  const enabled = store.offlineSigning !== false;
  const lang = store.language;

  return (
    <>
      <button
        type="button"
        className="quiet-button"
        disabled={busy}
        onClick={() => {
          void (enabled ? turnOff() : turnOn());
        }}
      >
        {enabled ? t(lang, 'offlineTurnOff') : t(lang, 'offlineTurnOn')}
      </button>
      {enabled ? <p className="note">{granted ? t(lang, 'offlineGranted') : t(lang, 'offlineGrant')}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </>
  );

  async function turnOff(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      if (store.settings.ownerKey) {
        await authPost(store.settings, '/v1/revoke', { ownerKey: store.settings.ownerKey, bindToken: token });
      }
      await updateStore((current) => ({
        ...current,
        offlineSigning: false,
        agents: current.agents.map((agent) => (agent.token === token ? { ...agent, offlineGranted: false } : agent)),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t(lang, 'vaultError'));
    } finally {
      setBusy(false);
    }
  }

  async function turnOn(): Promise<void> {
    await updateStore((current) => ({
      ...current,
      offlineSigning: null,
      agents: current.agents.map((agent) => (agent.token === token ? { ...agent, offlineGranted: false } : agent)),
    }));
  }
}
