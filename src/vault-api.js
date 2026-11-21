import { decryptLogin, recoverVault } from './crypto.js';
import { forgetTrustedKey, readTrustedKey } from './trusted-browser.js';
import { supabase } from './supabase.js';

export async function vaultRequest(action, fields = {}) {
  const { data, error } = await supabase.functions.invoke('pocket-loky-vault', {
    body: { action, ...fields }
  });

  if (error) {
    let detail;
    try {
      detail = await error.context?.json?.();
    } catch {
      // A gateway error may not have a JSON body.
    }

    throw new Error(
      detail?.error ||
      'Could not reach the vault. Check that the Supabase vault function is deployed and allows this website.'
    );
  }

  return data;
}

async function previousRows(userId) {
  const records = [];
  const pageSize = 200;
  let after;

  while (true) {
    let query = supabase.from('pocket_loky_logins')
      .select('id,payload,created_at')
      .eq('owner_id', userId)
      .order('id')
      .limit(pageSize);

    if (after) query = query.gt('id', after);

    const { data, error } = await query;
    if (error) throw new Error('Could not load your previous logins.');

    records.push(...data);
    if (data.length < pageSize) return records;
    after = data.at(-1).id;
  }
}

export async function importPreviousLogins(userId, recoveryCode) {
  const browserId = `${supabase.supabaseUrl}:${userId}`;
  let key;

  if (recoveryCode) {
    const { data, error } = await supabase.from('pocket_loky_vaults')
      .select('wrapped_key')
      .eq('owner_id', userId)
      .maybeSingle();

    if (error || !data) throw new Error('Could not find the old vault.');
    key = await recoverVault(userId, data.wrapped_key, recoveryCode);
  } else {
    key = (await readTrustedKey(browserId).catch(() => null))?.key;
  }

  if (!key) {
    throw new Error(
      'Open Pocket Loky in the browser where you set up your old vault, or enter its recovery key here.'
    );
  }

  const rows = await previousRows(userId);
  const items = [];

  try {
    for (const row of rows) {
      const login = await decryptLogin(key, userId, row.id, row.payload);
      items.push({ id: row.id, created_at: row.created_at, login });
    }
  } catch {
    throw new Error(
      'A previous login could not be opened. Your original encrypted records are still stored.'
    );
  }

  const size = 25;
  if (items.length === 0) {
    await vaultRequest('import', { items: [], done: true });
  }

  for (let start = 0; start < items.length; start += size) {
    await vaultRequest('import', {
      items: items.slice(start, start + size),
      done: start + size >= items.length
    });
  }

  await forgetTrustedKey(browserId).catch(() => {});
}