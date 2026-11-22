import { useState } from 'react';
import { usePrivy, useSigners } from '@privy-io/react-auth';
import { t } from '../../shared/i18n.ts';
import type { Store } from '../../shared/types.ts';
import { authPost, embeddedWalletId, ensureOwnerKey } from '../lib/offlineClient.ts';
import { updateStore } from '../lib/storage.ts';

export function OfflineGrant({ store, token }: { store: Store; token: string }) {
  const { user } = usePrivy();
  const { addSigners } = useSigners();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const granted = store.agents.some((agent) => agent.token === token && agent.offlineGranted);
  const lang = store.language;
  if (!store.settings.authUrl || !store.settings.privyKeyQuorumId) {
    return <p className="note">{t(lang, 'offlineNeedsQuorum')}</p>;
  }
  return (
    <>
      <button
        type="button"
        className="quiet-button"
        disabled={busy || granted}
        onClick={() => {
          void grant();
        }}
      >
        {granted ? t(lang, 'offlineGranted') : t(lang, 'offlineGrant')}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </>
  );

  async function grant(): Promise<void> {
    const solana = store.addresses?.solana;
    if (!solana) {
      setError(t(lang, 'walletNotReady'));
      return;
    }
    const solanaWalletId = embeddedWalletId(user, 'solana');
    if (!solanaWalletId) {
      setError(t(lang, 'offlineNeedsWalletId'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const quorum = store.settings.privyKeyQuorumId;
      await addSigners({ address: solana, signers: [{ signerId: quorum }] });
      const evm = store.addresses?.evm;
      const evmWalletId = embeddedWalletId(user, 'ethereum');
      if (evm && evmWalletId) {
        await addSigners({ address: evm, signers: [{ signerId: quorum }] });
      }
      const ownerKey = await ensureOwnerKey();
      await authPost(store.settings, '/v1/policy', {
        ownerKey,
        paused: store.policy.agentsPaused,
        whitelist: store.policy.whitelist.map((entry) => entry.address),
      });
      await authPost(store.settings, '/v1/grant', {
        ownerKey,
        bindToken: token,
        userId: store.auth?.userId || user?.id || '',
        solanaAddress: solana,
        evmAddress: evm,
        solanaWalletId,
        evmWalletId,
      });
      await updateStore((current) => ({
        ...current,
        agents: current.agents.map((agent) => (agent.token === token ? { ...agent, offlineGranted: true } : agent)),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t(lang, 'vaultError'));
    } finally {
      setBusy(false);
    }
  }
}
