const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function encode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function decode(text) {
  return Uint8Array.from(atob(text), character => character.charCodeAt(0));
}

function aesKey(bytes) {
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(key, bytes, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: encoder.encode(context)
  }, key, bytes);
  return { version: 1, iv: encode(iv), ciphertext: encode(ciphertext) };
}

async function open(key, envelope, context) {
  if (envelope?.version !== 1) throw new Error('Unsupported vault data version.');
  return crypto.subtle.decrypt({
    name: 'AES-GCM', iv: decode(envelope.iv), additionalData: encoder.encode(context)
  }, key, decode(envelope.ciphertext));
}

export async function createVault(userId) {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const recoveryBytes = crypto.getRandomValues(new Uint8Array(32));
  try {
    const key = await aesKey(seed);
    const recoveryKey = await aesKey(recoveryBytes);
    const wrappedKey = await seal(recoveryKey, seed, `pocket-loky:v1:recovery:${userId}`);
    const recoveryCode = encode(recoveryBytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    return { key, wrappedKey, recoveryCode };
  } finally {
    seed.fill(0);
    recoveryBytes.fill(0);
  }
}

export async function recoverVault(userId, envelope, code) {
  const normalized = code.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(normalized)) throw new Error('Enter the full recovery key.');
  const recoveryBytes = decode(normalized.replaceAll('-', '+').replaceAll('_', '/') + '=');
  let seed;
  try {
    const recoveryKey = await aesKey(recoveryBytes);
    seed = new Uint8Array(await open(recoveryKey, envelope, `pocket-loky:v1:recovery:${userId}`));
    return await aesKey(seed);
  } catch {
    throw new Error('That recovery key could not open this vault.');
  } finally {
    recoveryBytes.fill(0);
    seed?.fill(0);
  }
}

export function encryptLogin(key, ownerId, entryId, login) {
  const payload = encoder.encode(JSON.stringify(login));
  return seal(key, payload, `pocket-loky:v1:login:${ownerId}:${entryId}`).finally(() => payload.fill(0));
}

export async function decryptLogin(key, ownerId, entryId, payload) {
  const bytes = new Uint8Array(await open(key, payload, `pocket-loky:v1:login:${ownerId}:${entryId}`));
  try {
    return JSON.parse(decoder.decode(bytes));
  } finally {
    bytes.fill(0);
  }
}

export function lockLocalRecovery(key, ownerId, code) {
  const bytes = encoder.encode(code.trim());
  return seal(key, bytes, `pocket-loky:v1:local-recovery:${ownerId}`).finally(() => bytes.fill(0));
}

export async function showLocalRecovery(key, ownerId, payload) {
  const bytes = new Uint8Array(await open(key, payload, `pocket-loky:v1:local-recovery:${ownerId}`));
  try {
    return decoder.decode(bytes);
  } finally {
    bytes.fill(0);
  }
}
