import { addReference, chainEdges, chainOf, groupMembers, includedIds, referencedIds, removeReference } from './calc';
import type { Edge, Kind, Tile } from './model';

/** Tile kinds whose right-click starts linking mode (click other tiles to link them). Assets and groups stack on right-click. */
const RIGHT_CLICK_KINDS: Kind[] = ['chart', 'quantity'];
export const startsLinking = (tile: Tile) => RIGHT_CLICK_KINDS.includes(tile.kind) && !tile.dashNode;

/** Tiles whose + button starts linking mode. Sums only pick tiles while they aren't linked into a chain. */
export const plusLinks = (tile: Tile) => ['asset', 'group', 'chart', 'sum'].includes(tile.kind) || Boolean(tile.dashNode);

/** Every tile a group or chart includes, following groups inside it. */
function deepIncluded(tile: Tile, tiles: Tile[], edges: Edge[], seen = new Set<string>()): Set<string> {
  const out = new Set<string>();
  if (seen.has(tile.id)) return out;
  seen.add(tile.id);
  for (const id of includedIds(tile, tiles, edges)) {
    out.add(id);
    const t = tiles.find(x => x.id === id);
    if (t?.kind === 'group') for (const inner of deepIncluded(t, tiles, edges, seen)) out.add(inner);
  }
  return out;
}

/** Assets linked below a group belong to it by that link, so they can't be picked (or un-picked) a second way. */
export const isLinkedMember = (source: Tile, targetId: string, tiles: Tile[], edges: Edge[]) =>
  source.kind === 'group' && groupMembers(source.id, tiles, edges).includes(targetId);

/**
 * Whether `target` can be linked to `source` in linking mode. A tile is never offered when `source` would then count
 * it twice: through its chain, through a link below a group, or through a group already included.
 */
export function canLinkTo(source: Tile, target: Tile, tiles: Tile[], edges: Edge[]) {
  if (target.id === source.id || target.kind === 'chart') return false;
  const groupHolds = (id: string) => target.kind === 'group' && deepIncluded(target, tiles, edges).has(id);
  // Assets take extra quantities from outside their own chain; other assets can't add to their quantity.
  if (source.kind === 'asset') return target.kind !== 'asset' && !chainOf(source.id, chainEdges(tiles, edges)).has(target.id) && !groupHolds(source.id);
  if (source.dashNode) return !target.dashNode;
  if (source.kind === 'group' || source.kind === 'chart') {
    if (isLinkedMember(source, target.id, tiles, edges) || groupHolds(source.id)) return false;
    const direct = includedIds(source, tiles, edges).filter(id => id !== target.id);
    for (const id of direct) {
      const inner = tiles.find(t => t.id === id);
      if (inner?.kind === 'group' && deepIncluded(inner, tiles, edges).has(target.id)) return false;
      if (groupHolds(id)) return false;
    }
  }
  return true;
}

/** Whether `target` is currently linked to `source`. */
export function isLinkedTo(source: Tile, targetId: string) {
  if (source.kind === 'quantity') return referencedIds(source.expression ?? '').includes(targetId);
  return (source.selected ?? []).includes(targetId);
}

/** Link `target` to `source`, or unlink it if it is already linked. Quantities add the tile's value to their formula. */
export function toggleLinkTo(source: Tile, target: Tile): Tile {
  const linked = isLinkedTo(source, target.id);
  if (source.kind === 'quantity') {
    const expr = source.expression ?? '';
    return { ...source, expression: linked ? removeReference(expr, target.id) : addReference(expr, target.id, target.kind) };
  }
  const selected = source.selected ?? [];
  return { ...source, selected: linked ? selected.filter(s => s !== target.id) : [...selected, target.id] };
}

/** Banner text describing what clicking does while linking. */
export function linkingMessage(source: Tile) {
  const name = source.title.trim();
  const finish = (what: string) =>
    `${startsLinking(source) ? `right-click ${what}` : `click ${what}’s + again`}, click the background or press Escape to finish`;
  if (source.dashNode) return `Click the tiles holding your DASH (click again to remove) · ${finish('the masternode')}`;
  switch (source.kind) {
    case 'quantity':
      return `Click tiles to add their value to ${name || 'the quantity'}’s formula (click again to take it out) · ${finish('the quantity')}`;
    case 'asset':
      return `Click tiles to add them to ${name || 'the asset'}’s quantity (click again to remove) · ${finish('the asset')}`;
    case 'group':
      return `Click tiles to add them to ${name || 'the group'} (click again to remove) · ${finish('the group')}`;
    case 'sum':
      return `Click tiles to add them to ${name || 'the sum'} (click again to remove) · ${finish('the sum')}`;
    default:
      return `Click tiles to add them to ${name || 'the pie chart'} (click again to remove) · ${finish('the chart')}`;
  }
}
