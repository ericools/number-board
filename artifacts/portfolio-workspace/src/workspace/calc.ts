import { CHART_WIDTH, H_GAP, TILE_WIDTH, V_GAP, periodYears } from './model';
import type { Axis, Edge, Kind, Size, Tile } from './model';

/** Which tile kinds may be linked directly after which: to the right of it, or stacked below it (same rules both ways). */
/** Group tiles link like quantities: the group's total value goes into the chain. */
const LINK_RULES: Partial<Record<Kind, Kind[]>> = {
  asset: ['quantity', 'group', 'total', 'sum'],
  quantity: ['quantity', 'group', 'total', 'interest', 'sum'],
  group: ['quantity', 'group', 'total', 'interest', 'sum'],
  total: ['quantity', 'group', 'interest'],
  sum: ['quantity', 'group', 'interest'],
};
/** Tiles that count as quantities inside a chain. */
export const isQuantityLike = (t: Tile) => t.kind === 'quantity' || t.kind === 'group';
export const canLinkH = (left: Kind, right: Kind) => LINK_RULES[left]?.includes(right) ?? false;

export const parentOf = (edges: Edge[], id: string, axis: Axis) => edges.find(e => e.to === id && e.axis === axis)?.from;

/** Every tile connected to `id` through links of either direction, side by side or stacked (including itself). */
export function chainOf(id: string, edges: Edge[]): Set<string> {
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const e of edges) {
      const other = e.from === current ? e.to : e.to === current ? e.from : undefined;
      if (other && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}

/**
 * Asset tiles linked below a group are members of it, not part of a chain. Under a group the member assets may be
 * linked to each other in any shape (group ↓ asset → asset ↓ asset…). An asset never otherwise gets a parent link, so
 * any link into an asset is a membership link: it never joins chains and never changes the asset's own value.
 */
export const chainEdges = (tiles: Tile[], edges: Edge[]) => {
  const assets = new Set(tiles.filter(t => t.kind === 'asset').map(t => t.id));
  return edges.filter(e => !assets.has(e.to));
};

/** The asset tiles linked below a group (its members by link), following asset-to-asset links in either direction. */
export function groupMembers(groupId: string, tiles: Tile[], edges: Edge[]): string[] {
  const kinds = new Map(tiles.map(t => [t.id, t.kind]));
  if (kinds.get(groupId) !== 'group') return [];
  const out: string[] = [];
  const seen = new Set([groupId]);
  const queue = edges.filter(e => e.from === groupId && e.axis === 'v').map(e => e.to);
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || kinds.get(id) !== 'asset') continue;
    seen.add(id);
    out.push(id);
    for (const e of edges) if (e.from === id) queue.push(e.to);
  }
  return out;
}

/** Whether asset `id` is a member linked under a group (so other assets may be linked to it, either way). */
function inMemberTree(id: string, tiles: Tile[], edges: Edge[]) {
  const kinds = new Map(tiles.map(t => [t.id, t.kind]));
  const seen = new Set<string>();
  let current = id;
  while (kinds.get(current) === 'asset' && !seen.has(current)) {
    seen.add(current);
    const up = edges.find(e => e.to === current);
    if (!up) return false;
    if (kinds.get(up.from) === 'group') return up.axis === 'v';
    current = up.from;
  }
  return false;
}

const uniq = (ids: string[]) => [...new Set(ids)];

/** Tiles a group or chart includes, each once: groups take their picked tiles plus the assets linked below them. */
export function includedIds(tile: Tile, tiles: Tile[], edges: Edge[]): string[] {
  if (tile.kind === 'group') return uniq([...(tile.selected ?? []), ...groupMembers(tile.id, tiles, edges)]);
  return uniq(tile.selected ?? []);
}

export const defaultSize = (tile: Tile): Size => ({ w: tile.kind === 'chart' ? CHART_WIDTH : TILE_WIDTH, h: 96 });

export function evaluateExpression(expression: string, resolve: (id: string) => number): number {
  try {
    const expanded = expression
      .replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => `(${resolve(id)})`)
      .replace(/[$,]/g, '');
    if (!/^[\d\s.+\-*/()%e]*$/.test(expanded)) return Number.NaN;
    const value = Function(`"use strict"; return (${expanded.trim() || '0'})`)();
    return typeof value === 'number' ? value : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

/** Ids referenced as [[tile-id]] inside an expression. */
export const referencedIds = (expression: string) => [...expression.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].replace(VALUE_SUFFIX, ''));
/** "[[id:value]]" in a formula means an asset's Value field (price × quantity) rather than its unit price. */
export const VALUE_SUFFIX = /:value$/;
const refToken = (id: string, kind?: Kind) => `[[${id}${kind === 'asset' ? ':value' : ''}]]`;
/** Add a tile's value to the end of a formula. */
export function addReference(expression: string, id: string, kind?: Kind) {
  const trimmed = expression.trim();
  if (!trimmed || trimmed === '0') return refToken(id, kind);
  return `${trimmed} + ${refToken(id, kind)}`;
}
/** Take every reference to a tile back out of a formula, along with the + or − joining it. */
export function removeReference(expression: string, id: string) {
  const ref = `\\[\\[${id.replace(/[^\w-]/g, '\\$&')}(?::value)?\\]\\]`;
  const out = expression
    .replace(new RegExp(`\\s*[+-]\\s*${ref}`, 'g'), '')
    .replace(new RegExp(`${ref}\\s*\\+\\s*`, 'g'), '')
    .replace(new RegExp(ref, 'g'), '')
    .trim();
  return out || '0';
}

/** Replace [[tile-id]] references with readable tile names for display. */
export const describeExpression = (expression: string, nameOf: (id: string) => string) =>
  expression.replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => (VALUE_SUFFIX.test(id) ? `@${nameOf(id.replace(VALUE_SUFFIX, ''))} value` : `@${nameOf(id)}`));

export type Calculator = {
  valueOf: (id: string) => number;
  /** Totals: the asset and every quantity in the total's chain, wherever they sit. */
  totalInputs: (tile: Tile) => { asset?: Tile; quantities: Tile[]; linked: boolean };
  /** Asset tiles: units held on the tile itself plus every quantity in its chain. */
  assetQuantity: (tile: Tile) => number;
  /** What a tile is worth on a pie chart or in a group: assets count at their Value field (price × quantity), others at their value. */
  chartValue: (id: string) => number;
  /** Price used to show a masternode reward in dollars: its own live Dash price, else any Dash asset tile. */
  dashPrice: (tile: Tile) => number | undefined;
  interestBasis: (tile: Tile) => { ids: string[]; linked: boolean };
  /** Sum tiles: every quantity in the sum's chain (linked side by side or stacked, in any direction). */
  sumInputs: (tile: Tile) => { ids: string[]; linked: boolean };
  /** Groups and charts: every tile included, once (a group's picked tiles plus the assets linked below it). */
  includedIds: (tile: Tile) => string[];
  /** True when the tile's value is in dollars (for quantities: typed with $, or built from a dollar tile). */
  isCurrency: (id: string) => boolean;
};

export function createCalculator(tiles: Tile[], edges: Edge[]): Calculator {
  const byId = new Map(tiles.map(t => [t.id, t]));

  const links = chainEdges(tiles, edges);
  const linkedAt = (id: string) => links.some(e => e.from === id || e.to === id);
  const chainTiles = (id: string) => {
    const ids = chainOf(id, links);
    return tiles.filter(t => ids.has(t.id));
  };

  const totalInputs: Calculator['totalInputs'] = tile => {
    if (!linkedAt(tile.id)) return { quantities: [], linked: false };
    const chain = chainTiles(tile.id);
    return { asset: chain.find(t => t.kind === 'asset'), quantities: chain.filter(isQuantityLike), linked: true };
  };

  const isDash = (t?: Tile) => t?.kind === 'asset' && t.symbol?.toUpperCase() === 'DASH' && t.price !== undefined;
  // Masternodes never read the chain: the price is their own live Dash quote, else any Dash asset on the board.
  const dashPrice: Calculator['dashPrice'] = tile => tile.price ?? tiles.find(isDash)?.price;

  const interestBasis: Calculator['interestBasis'] = tile => {
    // Masternodes only use the tiles picked for them.
    if (tile.dashNode) return { ids: uniq(tile.selected ?? []), linked: false };
    const parent = parentOf(links, tile.id, 'h') ?? parentOf(links, tile.id, 'v');
    const p = parent ? byId.get(parent) : undefined;
    if (p && canLinkH(p.kind, 'interest')) return { ids: [p.id], linked: true };
    return { ids: uniq(tile.selected ?? []), linked: false };
  };

  const sumInputs: Calculator['sumInputs'] = tile => {
    if (!linkedAt(tile.id)) return { ids: uniq(tile.selected ?? []), linked: false };
    return { ids: chainTiles(tile.id).filter(isQuantityLike).map(t => t.id), linked: true };
  };

  const compute = (id: string, stack: Set<string>): number => {
    const tile = byId.get(id);
    if (!tile || stack.has(id)) return 0;
    const next = new Set(stack).add(id);
    const val = (ref: string) => resolve(ref, next);
    const sumOf = (ids: string[]) => ids.reduce((acc, ref) => acc + val(ref), 0);
    /** Units held on the asset tile itself plus tiles linked to it from outside its chain (asset tiles only). */
    const own = (t?: Tile) => (t?.kind === 'asset' ? extraOf(t, next) : 0);
    switch (tile.kind) {
      case 'asset':
        return tile.price ?? 0;
      case 'quantity': {
        const v = evaluateExpression(tile.expression ?? '0', val);
        return Number.isFinite(v) ? v : 0;
      }
      case 'total': {
        const { asset, quantities } = totalInputs(tile);
        return (asset?.price ?? 0) * (own(asset) + sumOf(quantities.map(q => q.id)));
      }
      case 'interest': {
        const yearly = ((tile.rate ?? 0) / 100) * periodYears(tile.period);
        if (tile.dashNode) {
          // Each picked tile's amount of DASH (an asset counts by its quantity) × the Dash price × the rate.
          const coins = uniq(tile.selected ?? []).reduce((acc, ref) => {
            const t = byId.get(ref);
            return acc + (t?.kind === 'asset' ? assetQuantityOf(t, next) : val(ref));
          }, 0);
          return coins * (dashPrice(tile) ?? 1) * yearly;
        }
        return sumOf(interestBasis(tile).ids) * yearly;
      }
      case 'sum': {
        const { ids, linked } = sumInputs(tile);
        return sumOf(ids) + (linked ? own(totalInputs(tile).asset) : 0);
      }
      case 'group':
        // Assets count at their Value field (price × quantity), not their unit price.
        return includedIds(tile, tiles, edges).reduce((acc, ref) => acc + chartValueOf(ref, next), 0);
      case 'chart':
        return includedIds(tile, tiles, edges).reduce((acc, ref) => acc + Math.max(0, chartValueOf(ref, next)), 0);
    }
  };

  /** A formula reference: a tile's value, or an asset's Value field for "id:value". */
  function resolve(ref: string, stack: Set<string>) {
    return VALUE_SUFFIX.test(ref) ? chartValueOf(ref.replace(VALUE_SUFFIX, ''), stack) : compute(ref, stack);
  }
  /** Asset tiles: own units plus the values of tiles linked to it from outside its chain (right-click linking). */
  function extraOf(tile: Tile, stack: Set<string>) {
    const key = `extra:${tile.id}`;
    if (stack.has(key)) return 0;
    const next = new Set(stack).add(key);
    // A tile already in the asset's chain counts there, never a second time as an extra.
    const chain = chainOf(tile.id, links);
    return (tile.quantity ?? 0) + uniq(tile.selected ?? []).filter(ref => !chain.has(ref)).reduce((acc, ref) => acc + compute(ref, next), 0);
  }
  function assetQuantityOf(tile: Tile, stack: Set<string>) {
    const key = `qty:${tile.id}`;
    if (stack.has(key)) return 0;
    const next = new Set(stack).add(key);
    const ids = chainTiles(tile.id).filter(isQuantityLike).map(t => t.id);
    return extraOf(tile, next) + ids.reduce((acc, ref) => acc + compute(ref, next), 0);
  }
  function chartValueOf(id: string, stack: Set<string>) {
    const t = byId.get(id);
    return t?.kind === 'asset' ? (t.price ?? 0) * assetQuantityOf(t, stack) : compute(id, stack);
  }

  function currency(id: string, stack: Set<string>): boolean {
    const tile = byId.get(id);
    if (!tile || stack.has(id)) return false;
    const next = new Set(stack).add(id);
    // Interest is in the unit of what it is earned on: a plain count (e.g. DASH coins) earns a count, not dollars.
    if (tile.kind === 'interest') {
      if (tile.dashNode) return dashPrice(tile) !== undefined;
      const ids = interestBasis(tile).ids;
      return ids.length === 0 || ids.some(ref => currency(ref, next));
    }
    // A chain sum of plain counts (e.g. coins) is a count too.
    if (tile.kind === 'sum') {
      const { ids, linked } = sumInputs(tile);
      return !linked || ids.some(ref => currency(ref, next));
    }
    // A group of plain counts is a count too.
    if (tile.kind === 'group') {
      const ids = includedIds(tile, tiles, edges);
      return ids.length === 0 || ids.some(ref => currency(ref, next));
    }
    if (tile.kind !== 'quantity') return true;
    const expr = tile.expression ?? '';
    if (tile.dollar || expr.includes('$')) return true;
    return referencedIds(expr).some(ref => currency(ref, next));
  }

  return {
    valueOf: id => resolve(id, new Set()),
    totalInputs,
    assetQuantity: tile => assetQuantityOf(tile, new Set()),
    chartValue: id => chartValueOf(id, new Set()),
    dashPrice,
    interestBasis,
    sumInputs,
    includedIds: tile => includedIds(tile, tiles, edges),
    isCurrency: id => currency(id, new Set()),
  };
}

/** All tiles attached to the right of / below the given tile (including itself). They move together. */
export function attachedIds(id: string, edges: Edge[]): Set<string> {
  const result = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const e of edges) {
      if (e.from === current && !result.has(e.to)) {
        result.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return result;
}

/**
 * Tiles linked below another must sit at least a gap below its bottom. When a tile grows (e.g. a group gains a row as
 * an asset joins it), push the tiles below it, and everything linked after them, down. Only measured sizes count, and
 * tiles are only ever pushed down, so repeated runs settle. Returns null when nothing needs to move.
 */
export function pushBelow(tiles: Tile[], edges: Edge[], sizes: Record<string, Size>): Tile[] | null {
  const y = new Map(tiles.map(t => [t.id, t.y]));
  let changed = false;
  for (let pass = 0; pass < tiles.length + 1; pass++) {
    let moved = false;
    for (const e of edges) {
      if (e.axis !== 'v') continue;
      const h = sizes[e.from]?.h;
      const top = y.get(e.from), childTop = y.get(e.to);
      if (h === undefined || top === undefined || childTop === undefined) continue;
      const need = top + h + V_GAP - childTop;
      if (need < 1) continue;
      for (const id of attachedIds(e.to, edges)) if (id !== e.from) y.set(id, (y.get(id) ?? 0) + need);
      moved = changed = true;
    }
    if (!moved) break;
  }
  return changed ? tiles.map(t => (y.get(t.id) !== t.y ? { ...t, y: Math.round(y.get(t.id)!) } : t)) : null;
}

/** Tiles hidden inside collapsed stacks: everything linked to the right of or below a collapsed tile. */
export function hiddenIds(tiles: Tile[], edges: Edge[]): Set<string> {
  const hidden = new Set<string>();
  for (const t of tiles) {
    if (!t.collapsed) continue;
    for (const id of attachedIds(t.id, edges)) if (id !== t.id) hidden.add(id);
  }
  return hidden;
}

/** `insertBefore` is set when the dragged tile slides into a chain between the target and its current right neighbour. */
export type Snap = { targetId: string; axis: Axis; x: number; y: number; insertBefore?: string };
export const SNAP_RADIUS = 80;

const childOf = (edges: Edge[], id: string, axis: Axis, ignore?: string) =>
  edges.find(e => e.axis === axis && e.from === id && e.to !== ignore)?.to;

/** Where the dragged tile could link after the target (to its right for 'h', below it for 'v'):
 *  a free slot, an insertion into the chain, or nothing. */
export function linkSlot(target: Tile, dragged: Tile, tiles: Tile[], edges: Edge[], axis: Axis): 'free' | 'insert' | null {
  // Assets stack below a group to join it, and link to the assets already under it (beside or below) to join too.
  if (dragged.kind === 'asset' && ((axis === 'v' && target.kind === 'group') || (target.kind === 'asset' && inMemberTree(target.id, tiles, edges)))) {
    const child = childOf(edges, target.id, axis, dragged.id);
    if (!child) return 'free';
    const childTile = tiles.find(t => t.id === child);
    return childTile?.kind === 'asset' && !childOf(edges, dragged.id, axis) ? 'insert' : null;
  }
  if (!canLinkH(target.kind, dragged.kind)) return null;
  // Masternodes are set up by hand (pick tiles with +) and never join a chain.
  if (target.dashNode || dragged.dashNode) return null;
  if (!oneAssetAfterLink(target, dragged, tiles, edges)) return null;
  const child = childOf(edges, target.id, axis, dragged.id);
  if (!child) return 'free';
  const childTile = tiles.find(t => t.id === child);
  // Only a tile with nothing linked after it on that side can slide into the middle of a chain.
  if (childTile && !childOf(edges, dragged.id, axis) && canLinkH(dragged.kind, childTile.kind)) return 'insert';
  return null;
}

/** A chain may hold only one asset: refuse links that would join two chains that each have one. */
function oneAssetAfterLink(target: Tile, dragged: Tile, tiles: Tile[], edges: Edge[]) {
  // Dropping a tile detaches it from its current parents first.
  const remaining = chainEdges(tiles, edges.filter(e => e.to !== dragged.id));
  const joined = new Set([...chainOf(target.id, remaining), ...chainOf(dragged.id, remaining)]);
  return tiles.filter(t => t.kind === 'asset' && joined.has(t.id)).length <= 1;
}

export function findSnap(
  dragged: Tile,
  pos: { x: number; y: number },
  tiles: Tile[],
  edges: Edge[],
  sizes: Record<string, Size>,
  /** Tiles that can't be link targets: the ones being dragged, hidden ones, and collapsed stacks. */
  skip: Set<string>,
): Snap | null {
  let best: Snap | null = null;
  let bestDistance = SNAP_RADIUS;
  const consider = (snap: Snap) => {
    const d = Math.hypot(pos.x - snap.x, pos.y - snap.y);
    if (d < bestDistance) {
      best = snap;
      bestDistance = d;
    }
  };
  for (const t of tiles) {
    if (skip.has(t.id)) continue;
    const size = sizes[t.id] ?? defaultSize(t);
    for (const axis of ['h', 'v'] as const) {
      const link = linkSlot(t, dragged, tiles, edges, axis);
      if (!link) continue;
      consider({
        targetId: t.id,
        axis,
        x: axis === 'h' ? t.x + size.w + H_GAP : t.x,
        y: axis === 'h' ? t.y : t.y + size.h + V_GAP,
        insertBefore: link === 'insert' ? childOf(edges, t.id, axis, dragged.id) : undefined,
      });
    }
  }
  return best;
}

/** First open grid slot on the canvas for a new tile. */
export function findFreeSpot(tiles: Tile[], sizes: Record<string, Size>, kind: Kind) {
  const w = kind === 'chart' ? CHART_WIDTH : TILE_WIDTH;
  const h = 120;
  for (let r = 0; r < 40; r++) {
    for (let c = 0; c < 5; c++) {
      const x = 40 + c * (TILE_WIDTH + H_GAP);
      const y = 40 + r * 150;
      const overlaps = tiles.some(t => {
        const s = sizes[t.id] ?? defaultSize(t);
        return x < t.x + s.w + 10 && x + w + 10 > t.x && y < t.y + s.h + 10 && y + h + 10 > t.y;
      });
      if (!overlaps) return { x, y };
    }
  }
  return { x: 40, y: 40 };
}
