import { useCallback, useEffect, useState } from 'react';
import { defaultWorkspace, newId } from './model';
import type { Workspace } from './model';

const STORE_KEY = 'tally-workspaces-v1';
const ACTIVE_KEY = 'tally-active-v1';

function loadWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Workspace[]) : [];
    return Array.isArray(parsed) && parsed.length ? parsed : [defaultWorkspace()];
  } catch {
    return [defaultWorkspace()];
  }
}

const stamp = () => new Date().toISOString();

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(loadWorkspaces);
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_KEY) ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const active = workspaces.find(w => w.id === activeId) ?? workspaces[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(workspaces));
      localStorage.setItem(ACTIVE_KEY, active.id);
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Browser storage is unavailable');
    }
  }, [workspaces, active.id]);

  const update = useCallback(
    (fn: (w: Workspace) => Workspace) =>
      setWorkspaces(prev =>
        prev.map(w => {
          if (w.id !== active.id) return w;
          const next = fn(w);
          return next === w ? w : { ...next, savedAt: stamp() };
        }),
      ),
    [active.id],
  );

  const rename = (name: string) => update(w => ({ ...w, name }));

  /** Adds a workspace read from a file and opens it. */
  const importWorkspace = (ws: Omit<Workspace, 'id'>) => {
    const added: Workspace = { ...ws, id: newId(), savedAt: stamp() };
    setWorkspaces(prev => [...prev, added]);
    setActiveId(added.id);
  };

  const createBlank = (name: string) => {
    const blank: Workspace = { id: newId(), name, tiles: [], edges: [], savedAt: stamp() };
    setWorkspaces(prev => [...prev, blank]);
    setActiveId(blank.id);
  };

  const remove = (id: string) => {
    if (workspaces.length < 2) return;
    const rest = workspaces.filter(w => w.id !== id);
    setWorkspaces(rest);
    if (id === active.id) setActiveId(rest[0].id);
  };

  return { workspaces, active, load: setActiveId, update, rename, importWorkspace, createBlank, remove, saveError };
}
