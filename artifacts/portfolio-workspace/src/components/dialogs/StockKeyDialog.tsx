import { useEffect, useState } from 'react';
import { Modal } from './Modal';

const SETTINGS_URL = `${import.meta.env.BASE_URL}api/settings`;

/** True in the Linux desktop (AppImage) build, where the user supplies their own Finnhub key. */
export const IS_DESKTOP = import.meta.env.VITE_DESKTOP === '1';

/** Desktop only: enter or remove the Finnhub key used for stock prices. It is stored on this computer by the desktop app. */
export function StockKeyDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(SETTINGS_URL)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Settings returned ${r.status}`))))
      .then((s: { finnhubKey: boolean }) => setHasKey(s.finnhubKey))
      .catch(err => setError(err instanceof Error ? err.message : 'Could not read settings'));
  }, []);

  const save = async (value: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(SETTINGS_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finnhubKey: value }) });
      const body = (await res.json().catch(() => ({}))) as { finnhubKey?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Settings returned ${res.status}`);
      setHasKey(Boolean(body.finnhubKey));
      setKey('');
      onChanged();
      if (value) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Stock price key" subtitle="Stock prices come from Finnhub, which needs a free personal API key. It is saved only on this computer." onClose={onClose}>
      <div className="form-grid">
        <div className="field-help note">
          {hasKey === null ? 'Checking…' : hasKey ? 'A key is saved, so stock prices are live.' : 'No key saved yet, so stock tiles keep their last price.'}
        </div>
        <div className="field">
          <label htmlFor="finnhub-key">{hasKey ? 'Replace key' : 'Finnhub API key'}</label>
          <input id="finnhub-key" type="password" autoComplete="off" spellCheck={false} value={key} placeholder="Paste your key" onChange={e => setKey(e.target.value)} />
          <div className="field-help">
            Get one free at&nbsp;<a href="https://finnhub.io/register" target="_blank" rel="noreferrer">finnhub.io/register</a>.
          </div>
          {error && <div className="field-help error">{error}</div>}
        </div>
      </div>
      <div className="modal-actions">
        <button className="soft-button danger" disabled={!hasKey || busy} onClick={() => save(null)}>Remove key</button>
        <button className="primary-button" disabled={!key.trim() || busy} onClick={() => save(key.trim())}>Save key</button>
      </div>
    </Modal>
  );
}
