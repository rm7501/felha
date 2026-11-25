// Private messages: host ⇄ each player share an ECDH P-256 key, payloads are AES-GCM encrypted.
import { b64, unb64 } from '../core/util.js';
const C = () => globalThis.crypto.subtle;
const EC = { name: 'ECDH', namedCurve: 'P-256' };

export async function genKeys() {
  const kp = await C().generateKey(EC, true, ['deriveKey']);
  const j = await C().exportKey('jwk', kp.publicKey);
  return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } };
}
export async function derive(priv, pub) {
  const pk = await C().importKey('jwk', { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y, ext: true }, EC, false, []);
  return C().deriveKey({ name: 'ECDH', public: pk }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function seal(key, obj) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await C().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function open(key, box) {
  const pt = await C().decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
export const keyTag = pub => (pub && pub.x ? pub.x.slice(0, 10) : '');
