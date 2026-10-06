import type { Workspace } from './model';

/** Workspaces saved to disk with Save As are plain JSON in this envelope. */
// Kept from the app's earlier name so files saved before the rename still open.
const FORMAT = 'ledgerly-workspace';
const KINDS = new Set(['asset', 'quantity', 'sum', 'total', 'group', 'interest', 'chart']);

export const workspaceFileName = (name: string) => `${name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'workspace'}.numberboard.json`;

type SavePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}>;

/**
 * Asks where to save (folder and file name) and writes the workspace there.
 * Returns false if the user cancelled. Browsers without a save picker (or embedded previews that block it)
 * fall back to a normal download, which lets the browser ask where to save.
 */
export async function saveWorkspaceToDisk(workspace: Workspace): Promise<boolean> {
  const { id: _id, ...rest } = workspace;
  const blob = new Blob([JSON.stringify({ format: FORMAT, version: 1, workspace: rest }, null, 2)], { type: 'application/json' });
  const suggestedName = workspaceFileName(workspace.name);
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName, types: [{ description: 'Number Board workspace', accept: { 'application/json': ['.json'] } }] });
      const file = await handle.createWritable();
      await file.write(blob);
      await file.close();
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false;
      if (!(err instanceof DOMException && err.name === 'SecurityError')) throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: suggestedName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Reads a file written by Save As. Throws a readable message when the file isn't a Number Board workspace. */
export function parseWorkspaceFile(text: string): Omit<Workspace, 'id'> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file isn’t a Number Board workspace (it isn’t valid JSON).');
  }
  const ws = (data as { format?: string; workspace?: unknown })?.format === FORMAT ? (data as { workspace: unknown }).workspace : data;
  const w = ws as Partial<Workspace> | null;
  const tilesOk = Array.isArray(w?.tiles) && w.tiles.every(t => t && typeof t.id === 'string' && KINDS.has(t.kind) && Number.isFinite(t.x) && Number.isFinite(t.y));
  const edgesOk = Array.isArray(w?.edges) && w.edges.every(e => e && typeof e.from === 'string' && typeof e.to === 'string' && (e.axis === 'h' || e.axis === 'v'));
  if (!w || !tilesOk || !edgesOk) throw new Error('This file isn’t a Number Board workspace.');
  return {
    name: typeof w.name === 'string' && w.name.trim() ? w.name : 'Opened workspace',
    tiles: w.tiles!,
    edges: w.edges!,
    savedAt: new Date().toISOString(),
    ...(typeof w.zoom === 'number' ? { zoom: w.zoom } : {}),
  };
}
