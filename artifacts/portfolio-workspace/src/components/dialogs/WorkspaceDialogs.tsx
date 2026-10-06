import { FileDown, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Workspace } from '../../workspace/model';
import { parseWorkspaceFile, saveWorkspaceToDisk } from '../../workspace/workspaceFile';
import { Modal } from './Modal';

const savedTime = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function SaveDialog({ workspace, onClose, onSave }: { workspace: Workspace; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(workspace.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = name.trim() || 'Untitled workspace';
  /** Save As: choose a folder and file name on this computer, then keep working under the new name. */
  const saveAs = async () => {
    setBusy(true);
    setError(null);
    try {
      if (await saveWorkspaceToDisk({ ...workspace, name: clean })) onSave(clean);
    } catch (err) {
      setError(err instanceof Error ? `Couldn’t save the file: ${err.message}` : 'Couldn’t save the file');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Save workspace" subtitle="Save keeps it in this app (edits also save automatically). Save As writes a file to a folder you choose." onClose={onClose}>
      <div className="field">
        <label htmlFor="ws-name">Workspace name</label>
        <input id="ws-name" autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSave(clean)} />
        {error && <div className="field-help error">{error}</div>}
      </div>
      <div className="modal-actions">
        <button className="soft-button" disabled={busy} onClick={saveAs}><FileDown size={14} /> Save As…</button>
        <button className="primary-button" disabled={busy} onClick={() => onSave(clean)}><Save size={14} /> Save</button>
      </div>
    </Modal>
  );
}

export function LoadDialog({ workspaces, activeId, onClose, onLoad, onDelete, onCreateBlank, onOpenFile }: { workspaces: Workspace[]; activeId: string; onClose: () => void; onLoad: (id: string) => void; onDelete: (id: string) => void; onCreateBlank: () => void; onOpenFile: (ws: Omit<Workspace, 'id'>) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  /** Opens a file written by Save As as a new workspace in the app. */
  const openFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      onOpenFile(parseWorkspaceFile(await file.text()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t open that file');
    }
  };
  const sorted = [...workspaces].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return (
    <Modal title="Load a workspace" subtitle="Choose a saved workspace to open." onClose={onClose}>
      <div className="pick-list">
        {sorted.map(w => (
          <div key={w.id} className={`pick-row workspace-row ${w.id === activeId ? 'selected' : ''}`}>
            <button className="workspace-open" onClick={() => onLoad(w.id)} aria-current={w.id === activeId}>
              <span className="pick-name">{w.name}{w.id === activeId ? ' · open now' : ''}</span>
              <span className="pick-meta">{w.tiles.length} tiles · saved {savedTime(w.savedAt)}</span>
            </button>
            <button
              className="row-delete"
              title="Delete workspace"
              aria-label={`Delete ${w.name}`}
              disabled={workspaces.length < 2}
              onClick={() => window.confirm(`Delete "${w.name}"? This cannot be undone.`) && onDelete(w.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      {error && <div className="field-help error">{error}</div>}
      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => { void openFile(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="modal-actions">
        <button className="soft-button" onClick={() => fileInput.current?.click()}><FileUp size={14} /> Open file…</button>
        <button className="soft-button" onClick={onCreateBlank}><Plus size={14} /> New blank workspace</button>
      </div>
    </Modal>
  );
}
