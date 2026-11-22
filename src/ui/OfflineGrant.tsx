import { useEffect, useRef, useState } from 'react';
import { usePrivy, useSigners } from '@privy-io/react-auth';
import { t } from '../../shared/i18n.ts';
import { shouldAutoGrantOffline } from '../../shared/store.ts';
import type { Store } from '../../shared/types.ts';
import { authPost, embeddedWalletId, ensureOwnerKey, offlinePolicyBody } from '../lib/offlineClient.ts';
import { updateStore } from '../lib/storage.ts';

export function OfflineGrant({ store, token }: { store: Store; token: string }) {
  const { user, authenticated } = usePrivy();
  const { addSigners } = useSigners();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tried = useRef(false);
  const granted = store.agents.some((agent) => agent.token === token && agent.offlineGranted);
  const enabled = store.offlineSigning !== false;
  const lang = store.language;
  const solanaWalletId = embeddedWalletId(user, 'solana');

  useEffect(() => {
    tried.current = false;
  }, [store.offlineSigning, token]);

  useEffect(() => {
    if (busy || tried.current) return;
    if (
      !shouldAutoGrantOffline({
        offlineSigning: store.offlineSigning,
        authenticated,
        bound: true,
        alreadyGranted: granted,
        hasSolanaAddress: Boolean(store.addresses?.solana),
        hasWalletId: Boolean(solanaWalletId),
      })
    ) {
      return;
    }
    tried.current = true;
    void grant();
  }, [authenticated, granted, busy, solanaWalletId, store.addresses?.solana, store.offlineSigning]);

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

  async function grant(): Promise<void> {
    const solana = store.addresses?.solana;
    if (!solana || !solanaWalletId) return;
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
      const latest = { ...store, settings: { ...store.settings, ownerKey } };
      await authPost(latest.settings, '/v1/policy', offlinePolicyBody(latest, ownerKey));
      await authPost(latest.settings, '/v1/grant', {
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
    tried.current = false;
    await updateStore((current) => ({ ...current, offlineSigning: null }));
  }
}
