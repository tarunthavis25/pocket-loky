import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { importPreviousLogins, vaultRequest } from './vault-api.js';
import { Brand, entrance } from './ui.jsx';

function Dialog({ title, children, onClose, busy }) {
  const dialog = useRef(null);

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="dialog-title"
      onCancel={event => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <motion.div className="dialog-content" {...entrance}>
        <header className="dialog-header">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            ×
          </button>
        </header>
        {children}
      </motion.div>
    </dialog>
  );
}

function LoginForm({ entry, onSave, onClose, busy, error }) {
  function submit(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);

    onSave({
      name: values.get('name').trim(),
      website: values.get('website').trim(),
      username: values.get('username').trim(),
      password: values.get('password')
    });
  }

  return (
    <Dialog title={entry?.id ? 'Edit login' : 'Add login'} onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <label>
          Name
          <input
            name="name"
            placeholder="e.g. Netflix"
            required
            maxLength={120}
            defaultValue={entry?.name}
            autoFocus
          />
        </label>
        <label>
          Website
          <input
            name="website"
            inputMode="url"
            placeholder="https://example.com"
            maxLength={512}
            defaultValue={entry?.website}
          />
        </label>
        <label>
          Username or email
          <input
            name="username"
            maxLength={254}
            autoComplete="off"
            defaultValue={entry?.username}
          />
        </label>
        <PasswordField initial={entry?.password} />

        {error && <p role="alert" className="error">{error}</p>}

        <div className="actions">
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <motion.button type="submit" className="primary" whileTap={{ scale: .98 }} disabled={busy}>
            {busy ? 'Saving…' : 'Save login'}
          </motion.button>
        </div>
      </form>
    </Dialog>
  );
}

function PasswordField({ initial }) {
  const [visible, setVisible] = useState(false);

  return (
    <label>
      Password
      <span className="input-with-action">
        <input
          name="password"
          type={visible ? 'text' : 'password'}
          required
          maxLength={1024}
          autoComplete="new-password"
          defaultValue={initial}
          spellCheck={false}
        />
        <button type="button" onClick={() => setVisible(value => !value)}>
          {visible ? 'Hide' : 'Show'}
        </button>
      </span>
    </label>
  );
}

export function Vault({ user, onSignOut }) {
  const [entries, setEntries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState(null);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [canImport, setCanImport] = useState(false);
  const [unreadable, setUnreadable] = useState(0);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const revealRequest = useRef(0);

  const profileName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Google user';

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = entries.filter(entry =>
    [entry.name, entry.website, entry.username].some(field =>
      (field ?? '').toLowerCase().includes(normalizedQuery)
    )
  );
  const active = filtered.find(entry => entry.id === selectedId) ?? filtered[0];
  const activePassword = revealed?.id === active?.id ? revealed?.password : undefined;

  function hidePassword() {
    revealRequest.current += 1;
    setRevealed(null);
  }

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');

    async function load() {
      try {
        const result = await vaultRequest('list');
        if (!current) return;
        setEntries(result.items);
        setCanImport(result.canImport);
        setUnreadable(result.unreadable);
        setReady(true);
      } catch (failure) {
        if (current) setError(failure.message);
      } finally {
        if (current) setLoading(false);
      }
    }

    load();
    return () => { current = false; };
  }, [reload]);

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) hidePassword();
    }

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (activePassword === undefined) return;
    const timeout = window.setTimeout(hidePassword, 30_000);
    return () => window.clearTimeout(timeout);
  }, [activePassword, active?.id]);

  async function run(operation, onError = setError) {
    setBusy(true);
    onError('');
    setNotice('');
    try {
      await operation();
    } catch (failure) {
      onError(failure.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function openModal(value) {
    hidePassword();
    setFormError('');
    setModal(value);
  }

  function saveLogin(login) {
    run(async () => {
      const summary = await vaultRequest(modal.entry ? 'edit' : 'save', {
        id: modal.id,
        login
      });
      setEntries(current => [summary, ...current.filter(entry => entry.id !== summary.id)]
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)));
      setSelectedId(summary.id);
      setQuery('');
      setModal(null);
      setNotice('Login saved.');
    }, setFormError);
  }

  function editLogin() {
    const { id } = active;
    run(async () => {
      const login = await vaultRequest('read', { id });
      openModal({ kind: 'form', id, entry: { ...login, id } });
    });
  }

  function deleteLogin() {
    run(async () => {
      const id = modal.entry.id;
      await vaultRequest('delete', { id });
      setEntries(current => current.filter(entry => entry.id !== id));
      setModal(null);
      setNotice('Login deleted.');
    }, setFormError);
  }

  function showPassword() {
    if (activePassword !== undefined) {
      hidePassword();
      return;
    }

    const { id } = active;
    const ticket = ++revealRequest.current;
    run(async () => {
      const { password } = await vaultRequest('read', { id });
      if (ticket === revealRequest.current && !document.hidden) {
        setRevealed({ id, password });
      }
    });
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(activePassword);
      setNotice('Password copied.');
    } catch {
      setNotice('Could not copy. You can select and copy the text manually.');
    }
  }

  function importLogins(event) {
    event.preventDefault();
    const recovery = new FormData(event.currentTarget).get('recovery')?.trim();
    run(async () => {
      await importPreviousLogins(user.id, recovery);
      setModal(null);
      setCanImport(false);
      setNotice('Previous logins imported.');
      setReload(value => value + 1);
    }, setFormError);
  }

  return <>
    <header className="topbar">
      <Brand />
      <div className="account">
        <span className="avatar" aria-hidden="true">
          {profileName.trim().charAt(0).toUpperCase()}
        </span>
        <span className="account-name">{profileName}</span>
        <button type="button" disabled={busy} onClick={() => {
          hidePassword();
          run(onSignOut);
        }}>Sign out</button>
      </div>
    </header>

    <motion.main className="dashboard" {...entrance}>
      <div className="dashboard-heading">
        <div>
          <h1>My vault</h1>
          {ready && <p>{entries.length} {entries.length === 1 ? 'saved login' : 'saved logins'}</p>}
        </div>
        {ready && <motion.button
          className="primary"
          whileTap={{ scale: .97 }}
          disabled={busy || loading}
          onClick={() => openModal({ kind: 'form', id: crypto.randomUUID() })}
        >+ New login</motion.button>}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {unreadable > 0 && <p className="error" role="status">Some saved logins could not be opened.</p>}
      {loading && <p className="empty" role="status">Opening your vault…</p>}
      {(!ready || error) && !loading && (
        <button type="button" onClick={() => setReload(value => value + 1)}>Reload vault</button>
      )}

      {canImport && <section className="glass panel setup" style={{ marginBlock: '0 1rem' }}>
        <h2>Move your previous logins</h2>
        <p>Import logins saved before the Google-only update.</p>
        <button onClick={() => openModal({ kind: 'import' })} disabled={busy}>Import previous logins</button>
      </section>}

      {ready && <div className="vault-layout">
        <section className="glass panel list" aria-label="Saved logins">
          <label className="visually-hidden" htmlFor="search">Search logins</label>
          <input
            type="search"
            id="search"
            placeholder="Search logins"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              hidePassword();
            }}
          />
          {filtered.length === 0 && (
            <p className="empty">{normalizedQuery ? 'No matching logins.' : 'No saved logins yet.'}</p>
          )}
          <ul>
            {filtered.map(entry => <li key={entry.id}>
              <motion.button
                className="entry"
                aria-pressed={active?.id === entry.id}
                whileTap={{ scale: .98 }}
                onClick={() => {
                  setSelectedId(entry.id);
                  hidePassword();
                  setNotice('');
                }}
              >
                <span className="entry-icon" aria-hidden="true">{entry.name.charAt(0).toUpperCase()}</span>
                <span className="entry-text">
                  <strong>{entry.name}</strong>
                  {entry.website && <small>{entry.website}</small>}
                </span>
              </motion.button>
            </li>)}
          </ul>
        </section>

        <section className="glass panel details" aria-label="Login details">
          <AnimatePresence mode="wait" initial={false}>
            {active ? <motion.div
              key={active.id}
              {...entrance}
              exit={{ opacity: 0, y: -4, transition: { duration: .12 } }}
            >
              <div className="details-heading">
                <span className="entry-icon" aria-hidden="true">{active.name.charAt(0).toUpperCase()}</span>
                <div><h2>{active.name}</h2><p>{active.website}</p></div>
              </div>
              <dl>
                <dt>Username</dt>
                <dd>{active.username || '—'}</dd>
                <dt>Password</dt>
                <dd className="password-row">
                  <code aria-label={activePassword === undefined ? 'Password hidden' : undefined}>
                    {activePassword ?? '••••••••••••'}
                  </code>
                  <div className="password-actions">
                    <button onClick={showPassword} disabled={busy}>
                      {activePassword === undefined ? 'Show' : 'Hide'}
                    </button>
                    {activePassword !== undefined && <button onClick={copyPassword}>Copy</button>}
                  </div>
                </dd>
              </dl>
              <div className="entry-actions">
                <button onClick={editLogin} disabled={busy}>Edit login</button>
                <button className="danger" onClick={() => openModal({ kind: 'delete', entry: active })} disabled={busy}>
                  Delete login
                </button>
              </div>
            </motion.div> : <motion.div key="empty" {...entrance} className="empty detail-empty">
              Select a login to view its details.
            </motion.div>}
          </AnimatePresence>
        </section>
      </div>}
    </motion.main>

    {modal?.kind === 'form' && <LoginForm
      key={modal.id}
      entry={modal.entry}
      onSave={saveLogin}
      onClose={() => setModal(null)}
      busy={busy}
      error={formError}
    />}

    {modal?.kind === 'import' && <Dialog title="Import previous logins" onClose={() => setModal(null)} busy={busy}>
      <form onSubmit={importLogins}>
        <p>Use the browser where you set up your old vault. If you are on a different browser, use your old recovery key once.</p>
        <label>
          Old recovery key (optional)
          <input name="recovery" type="password" autoComplete="off" maxLength={48} />
        </label>
        {formError && <p role="alert" className="error">{formError}</p>}
        <div className="actions">
          <button type="button" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Importing…' : 'Import logins'}</button>
        </div>
      </form>
    </Dialog>}

    {modal?.kind === 'delete' && <Dialog title="Delete login?" onClose={() => setModal(null)} busy={busy}>
      <p>This removes the saved login for <strong>{modal.entry.name}</strong> from the dashboard.</p>
      {formError && <p role="alert" className="error">{formError}</p>}
      <div className="actions">
        <button type="button" onClick={() => setModal(null)} autoFocus disabled={busy}>Cancel</button>
        <button type="button" className="danger-solid" disabled={busy} onClick={deleteLogin}>
          {busy ? 'Deleting…' : 'Delete login'}
        </button>
      </div>
    </Dialog>}
  </>;
}