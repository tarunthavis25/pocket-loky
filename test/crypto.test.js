import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVault, decryptLogin, encryptLogin, lockLocalRecovery, recoverVault, showLocalRecovery } from '../src/crypto.js';

const example = {
  name: 'Sample streaming service',
  website: 'https://example.com',
  username: 'viewer@example.com',
  password: '  Fake-example-🟢  '
};

test('logins are encrypted with fresh nonces and only readable with the vault key', async () => {
  const { key } = await createVault('owner');
  const first = await encryptLogin(key, 'owner', 'login', example);
  const second = await encryptLogin(key, 'owner', 'login', example);
  assert.equal(key.extractable, false);
  assert.notEqual(first.iv, second.iv);
  assert.ok(!JSON.stringify(first).includes(example.password));
  assert.deepEqual(await decryptLogin(key, 'owner', 'login', first), example);
  const other = await createVault('other');
  await assert.rejects(decryptLogin(other.key, 'owner', 'login', first));
  await assert.rejects(decryptLogin(key, 'other', 'login', first));
  await assert.rejects(decryptLogin(key, 'owner', 'different-login', first));
});

test('the recovery code restores the same vault on a different browser', async () => {
  const { key, wrappedKey, recoveryCode } = await createVault('owner');
  const payload = await encryptLogin(key, 'owner', 'login', example);
  const restored = await recoverVault('owner', wrappedKey, recoveryCode);
  assert.equal(restored.extractable, false);
  assert.deepEqual(await decryptLogin(restored, 'owner', 'login', payload), example);
  await assert.rejects(recoverVault('other', wrappedKey, recoveryCode));
  const wrong = (recoveryCode[0] === 'A' ? 'B' : 'A') + recoveryCode.slice(1);
  await assert.rejects(recoverVault('owner', wrappedKey, wrong));
});

test('a trusted browser can show its locally encrypted recovery key', async () => {
  const { key, recoveryCode } = await createVault('owner');
  const local = await lockLocalRecovery(key, 'owner', recoveryCode);
  assert.ok(!JSON.stringify(local).includes(recoveryCode));
  assert.equal(await showLocalRecovery(key, 'owner', local), recoveryCode);
  await assert.rejects(showLocalRecovery(key, 'other', local));
});
