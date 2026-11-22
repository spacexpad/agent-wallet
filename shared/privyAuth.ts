export type PrivyAuthPayload = {
  version: 1;
  method: 'POST';
  url: string;
  body: unknown;
  headers: { 'privy-app-id': string };
};

export function authorizationPayload(input: { url: string; body: unknown; appId: string }): PrivyAuthPayload {
  return {
    version: 1,
    method: 'POST',
    url: input.url,
    body: input.body,
    headers: { 'privy-app-id': input.appId },
  };
}

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function signAuthorizationPayload(privateKeyPkcs8: Uint8Array, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', bytesOf(privateKeyPkcs8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bytesOf(new TextEncoder().encode(payload))));
  const der = derFromP1363(raw);
  let text = '';
  for (const byte of der) text += String.fromCharCode(byte);
  return btoa(text);
}

export function derFromP1363(raw: Uint8Array): Uint8Array {
  if (raw.length !== 64) throw new Error('Expected a P-256 signature.');
  const r = derInt(raw.slice(0, 32));
  const s = derInt(raw.slice(32));
  const body = new Uint8Array(2 + r.length + 2 + s.length);
  body[0] = 0x02;
  body[1] = r.length;
  body.set(r, 2);
  const sAt = 2 + r.length;
  body[sAt] = 0x02;
  body[sAt + 1] = s.length;
  body.set(s, sAt + 2);
  const out = new Uint8Array(2 + body.length);
  out[0] = 0x30;
  out[1] = body.length;
  out.set(body, 2);
  return out;
}

function bytesOf(value: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return copy;
}

function derInt(value: Uint8Array): Uint8Array {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start += 1;
  const body = value.slice(start);
  if ((body[0] & 0x80) === 0) return body;
  const out = new Uint8Array(body.length + 1);
  out.set(body, 1);
  return out;
}

export function solanaMessageRpc(message: Uint8Array): { method: 'signMessage'; params: { message: string; encoding: 'base64' } } {
  let text = '';
  for (const byte of message) text += String.fromCharCode(byte);
  return { method: 'signMessage', params: { message: btoa(text), encoding: 'base64' } };
}
