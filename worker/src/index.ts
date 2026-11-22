import { DurableObject } from 'cloudflare:workers';
import { handleAuthRequest, emptyAuthState } from '../../shared/offlineHttp.ts';
import type { LedgerState } from '../../shared/offlineLedger.ts';
import { createHttpPrivy, type PrivyEnv } from './privy.ts';

export interface Env extends PrivyEnv {
  LEDGER: DurableObjectNamespace;
  PRIVY_KEY_QUORUM_ID?: string;
}

export class AuthorizationLedger extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const state = (await this.ctx.storage.get<LedgerState>('ledger')) ?? emptyAuthState();
      const outcome = await handleAuthRequest(state, request, {
        now: () => Date.now(),
        privy: createHttpPrivy(this.env),
      });
      if (outcome.persist) await this.ctx.storage.put('ledger', outcome.state);
      return outcome.response;
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.LEDGER.idFromName('authorization');
    return env.LEDGER.get(id).fetch(request);
  },
};

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): { fetch(request: Request): Promise<Response> };
}

interface DurableObjectId {
  toString(): string;
}
