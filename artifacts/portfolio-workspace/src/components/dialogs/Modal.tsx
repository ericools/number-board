import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Kind } from '../../workspace/model';
import type { ReactNode } from 'react';
import { KIND_LABEL, money, nice, tileName } from '../../workspace/model';
import type { Tile } from '../../workspace/model';
import type { Calculator } from '../../workspace/calc';

export function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <div>
            <h3 id="modal-title">{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="close-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

type SortMode = 'name' | 'value' | null;
/** Tile-type filters in the pickers; masternodes get their own button. */
type Filter = Kind | 'masternode';
const FILTERS: Filter[] = ['asset', 'quantity', 'sum', 'total', 'interest', 'masternode', 'group', 'chart'];
const FILTER_LABEL: Record<Filter, string> = { ...KIND_LABEL, masternode: 'Masternode' };
const filterOf = (t: Tile): Filter => (t.dashNode ? 'masternode' : t.kind);

/** List of tiles where included tiles are highlighted; click a row to include or exclude it. Optional A–Z / value sorting. */
export function TilePicker({ tiles, selected, onToggle, calc, emptyText, tall }: { tiles: Tile[]; selected: string[]; onToggle: (id: string) => void; calc: Calculator; emptyText?: string; tall?: boolean }) {
  const [sort, setSort] = useState<SortMode>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  if (!tiles.length) return <div className="pick-empty">{emptyText ?? 'No tiles available yet.'}</div>;
  // Only offer filters for tile types that are actually in the list.
  const filters = FILTERS.filter(f => tiles.some(t => filterOf(t) === f));
  const filtered = filter ? tiles.filter(t => filterOf(t) === filter) : tiles;
  const shown =
    sort === 'name'
      ? [...filtered].sort((a, b) => tileName(a).localeCompare(tileName(b), undefined, { sensitivity: 'base', numeric: true }))
      : sort === 'value'
        ? [...filtered].sort((a, b) => calc.valueOf(b.id) - calc.valueOf(a.id))
        : filtered;
  const toggle = (mode: Exclude<SortMode, null>) => setSort(s => (s === mode ? null : mode));
  return (
    <>
      {filters.length > 1 && (
        <div className="pick-sort pick-filter" role="group" aria-label="Show tile type">
          <span>Show</span>
          <button type="button" className={`sort-toggle ${filter === null ? 'selected' : ''}`} aria-pressed={filter === null} onClick={() => setFilter(null)}>All</button>
          {filters.map(f => (
            <button key={f} type="button" className={`sort-toggle ${filter === f ? 'selected' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(filter === f ? null : f)}>
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
      )}
      <div className="pick-sort" role="group" aria-label="Sort tiles">
        <span>Sort</span>
        <button type="button" className={`sort-toggle ${sort === 'name' ? 'selected' : ''}`} aria-pressed={sort === 'name'} onClick={() => toggle('name')}>A–Z</button>
        <button type="button" className={`sort-toggle ${sort === 'value' ? 'selected' : ''}`} aria-pressed={sort === 'value'} onClick={() => toggle('value')}>High to low value</button>
      </div>
      <div className={`pick-list ${tall ? 'tall' : ''}`}>
        {shown.length === 0 && <div className="pick-empty">No tiles of that type.</div>}
        {shown.map(t => {
          const on = selected.includes(t.id);
          const v = calc.valueOf(t.id);
          return (
            <button key={t.id} type="button" className={`pick-row ${on ? 'selected' : ''}`} aria-pressed={on} onClick={() => onToggle(t.id)}>
              <span className="pick-name">{tileName(t)}</span>
              <span className="pick-meta">{KIND_LABEL[t.kind]} · {calc.isCurrency(t.id) ? money(v) : nice(v)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export const toggleId = (list: string[], id: string) => (list.includes(id) ? list.filter(v => v !== id) : [...list, id]);
