export type RemoteBody = { ok?: boolean; result?: unknown; error?: string; code?: string; bindToken?: string; agentId?: string; agentName?: string };

export function authorizationUrl(): string {
  return (process.env.SPACEXPAD_AUTH_URL ?? '').trim().replace(/\/$/, '');
}

export function fallbackToExtension(code: string | undefined, networkError: boolean): boolean {
  if (networkError) return true;
  return code === 'not-granted';
}

export async function postAuthorization(url: string, path: string, body: unknown, bindToken = ''): Promise<RemoteBody> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (bindToken) headers.authorization = `Bearer ${bindToken}`;
  const response = await fetch(`${url}${path}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as RemoteBody) : {};
  if (!response.ok && json.ok !== false) {
    return { ok: false, error: json.error || `Authorization service returned ${response.status}.`, code: json.code };
  }
  return json;
}
