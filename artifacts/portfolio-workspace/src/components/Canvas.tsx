import { Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { attachedIds, defaultSize, findSnap, hiddenIds, linkSlot } from '../workspace/calc';
import type { Calculator, Snap } from '../workspace/calc';
import type { Edge, Size, Tile } from '../workspace/model';
import { TileCard } from './TileCard';
import { canLinkTo, isLinkedMember, isLinkedTo, linkingMessage, startsLinking, toggleLinkTo } from '../workspace/linking';

type Point = { x: number; y: number };
type DragState = {
  id: string;
  startX: number;
  startY: number;
  origins: Record<string, Point>;
  moving: Set<string>;
  moved: boolean;
  dx: number;
  dy: number;
  snap: Snap | null;
  /** Several picked tiles moving as one: they keep their links among themselves and never snap. */
  multi: boolean;
};
/** The selection box, in board units. */
type Marquee = { pointerId: number; x0: number; y0: number; x1: number; y1: number; add: boolean; base: Set<string> };
type DragView = { id: string; dx: number; dy: number; snap: Snap | null; moving: Set<string> };

export type DragCommit = { id: string; origins: Record<string, Point>; dx: number; dy: number; snap: Snap | null };
/** An entry in the right-click menu on empty board space. `at` is where the board was clicked, in board units. */
export type AddOption = { key: string; label: string; icon: ReactNode; onPick: (at: Point) => void };

type Props = {
  tiles: Tile[];
  edges: Edge[];
  calc: Calculator;
  zoom: number;
  sizes: Record<string, Size>;
  onSizes: (update: (prev: Record<string, Size>) => Record<string, Size>) => void;
  onCommitDrag: (commit: DragCommit) => void;
  onUnlink: (edge: Edge) => void;
  onOpenOptions: (id: string) => void;
  onDelete: (id: string) => void;
  onZoomStep: (delta: number) => void;
  onUpdateTile: (tile: Tile) => void;
  addOptions: AddOption[];
};

const HEAD_Y = 26;

export function Canvas({ tiles, edges, calc, zoom, sizes, onSizes, onCommitDrag, onUnlink, onOpenOptions, onDelete, onZoomStep, onUpdateTile, addOptions }: Props) {
  const byId = useMemo(() => new Map(tiles.map(t => [t.id, t])), [tiles]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [view, setView] = useState<DragView | null>(null);
  const drag = useRef<DragState | null>(null);
  const hidden = useMemo(() => hiddenIds(tiles, edges), [tiles, edges]);
  // Linking mode (right-click a chart or quantity, or press a tile's +): the source tile's id while it's on.
  const [linkingChart, setLinkingChart] = useState<string | null>(null);
  const chart = linkingChart ? byId.get(linkingChart) : undefined;
  useEffect(() => {
    if (linkingChart && !chart) setLinkingChart(null);
  }, [linkingChart, chart]);
  /** Clicking a tile while linking links it to the source tile, or unlinks it if it's already linked. */
  const toggleInChart = (id: string) => {
    const c = latest.current.chart;
    const target = byId.get(id);
    if (!c || !target || !canLinkTo(c, target, latest.current.tiles, latest.current.edges)) return;
    onUpdateTile(toggleLinkTo(c, target));
  };
  // Tiles picked with the selection box; dragging any of them moves them all.
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const latest = useRef({ tiles, edges, sizes, zoom, hidden, onCommitDrag, chart, toggleInChart, picked });
  latest.current = { tiles, edges, sizes, zoom, hidden, onCommitDrag, chart, toggleInChart, picked };
  useEffect(() => {
    if (picked.size === 0) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicked(new Set());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked]);
  useEffect(() => {
    if (!linkingChart) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLinkingChart(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linkingChart]);

  // Right-click menu on empty board space for adding tiles there.
  const [addMenu, setAddMenu] = useState<{ left: number; top: number; at: Point } | null>(null);
  useEffect(() => {
    if (!addMenu) return;
    const close = (e: Event) => {
      if (e.type === 'pointerdown' && (e.target as HTMLElement).closest('.add-menu')) return;
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      setAddMenu(null);
    };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', close);
      window.removeEventListener('blur', close);
    };
  }, [addMenu]);
  const addMenuRef = useRef<HTMLDivElement>(null);
  // Nudge the menu back inside the window once its real size is known (a DOM-only change, so no re-render loop).
  useLayoutEffect(() => {
    const el = addMenuRef.current;
    if (!el || !addMenu) return;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(addMenu.left, window.innerWidth - r.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(addMenu.top, window.innerHeight - r.height - 8))}px`;
  }, [addMenu]);
  const openAddMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el || (e.target as HTMLElement).closest('.tile,button,input,select,textarea,a,[role="menu"],[role="dialog"]')) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const at = {
      x: Math.max(0, Math.round((e.clientX - rect.left - el.clientLeft + el.scrollLeft) / zoom)),
      y: Math.max(0, Math.round((e.clientY - rect.top - el.clientTop + el.scrollTop) / zoom)),
    };
    setAddMenu({ left: e.clientX, top: e.clientY, at });
  };

  // Measure tiles so snapping, connectors, and the snap preview use real sizes.
  const observer = useMemo(
    () =>
      new ResizeObserver(entries => {
        onSizes(prev => {
          let next = prev;
          for (const entry of entries) {
            const el = entry.target as HTMLElement;
            const id = el.dataset.tileId;
            if (!id) continue;
            const size = { w: el.offsetWidth, h: el.offsetHeight };
            if (prev[id]?.w !== size.w || prev[id]?.h !== size.h) {
              if (next === prev) next = { ...prev };
              next[id] = size;
            }
          }
          return next;
        });
      }),
    [onSizes],
  );
  useEffect(() => () => observer.disconnect(), [observer]);
  const refCache = useRef(new Map<string, (el: HTMLDivElement | null) => () => void>());
  const tileRef = useCallback(
    (id: string) => {
      let cb = refCache.current.get(id);
      if (!cb) {
        cb = (el: HTMLDivElement | null) => {
          if (el) observer.observe(el);
          return () => {
            if (el) observer.unobserve(el);
          };
        };
        refCache.current.set(id, cb);
      }
      return cb;
    },
    [observer],
  );

  // The mouse wheel scrolls the board natively (Shift+wheel scrolls sideways). Ctrl+wheel or a trackpad
  // pinch scales the tiles instead, keeping the point under the cursor in place.
  const wrapRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ cx: number; cy: number; mx: number; my: number } | null>(null);
  const wheel = useRef({ acc: 0, onZoomStep, zoom });
  wheel.current.onZoomStep = onZoomStep;
  wheel.current.zoom = zoom;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.deltaY === 0) return;
      e.preventDefault();
      const w = wheel.current;
      // A mouse notch is ~100px; trackpads send many small deltas, so accumulate them into steps.
      w.acc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      if (Math.abs(w.acc) < 50) return;
      const delta = w.acc < 0 ? 0.1 : -0.1;
      w.acc = 0;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      anchor.current = { cx: (el.scrollLeft + mx) / w.zoom, cy: (el.scrollTop + my) / w.zoom, mx, my };
      w.onZoomStep(delta);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    const a = anchor.current;
    anchor.current = null;
    if (!el || !a) return;
    el.scrollLeft = a.cx * zoom - a.mx;
    el.scrollTop = a.cy * zoom - a.my;
  }, [zoom]);

  // Press on empty background and drag to draw a selection box; the tiles it touches are picked.
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const boardPoint = (e: { clientX: number; clientY: number }) => {
    const el = wrapRef.current!;
    const rect = el.getBoundingClientRect();
    return { x: (e.clientX - rect.left - el.clientLeft + el.scrollLeft) / zoom, y: (e.clientY - rect.top - el.clientTop + el.scrollTop) / zoom };
  };
  const startMarquee = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.tile,button,input,select,textarea,a,[role="menu"],[role="dialog"]')) return;
    // Clicks on the scrollbars land on the board itself, outside its content box.
    if (e.target === el && (e.nativeEvent.offsetX > el.clientWidth || e.nativeEvent.offsetY > el.clientHeight)) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const p = boardPoint(e);
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    setMarquee({ pointerId: e.pointerId, x0: p.x, y0: p.y, x1: p.x, y1: p.y, add, base: add ? picked : new Set() });
    if (!add) setPicked(new Set());
  };
  const boxOf = (m: Marquee) => ({ left: Math.min(m.x0, m.x1), top: Math.min(m.y0, m.y1), width: Math.abs(m.x1 - m.x0), height: Math.abs(m.y1 - m.y0) });
  const moveMarquee = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!marquee || marquee.pointerId !== e.pointerId) return;
    const p = boardPoint(e);
    const next = { ...marquee, x1: p.x, y1: p.y };
    setMarquee(next);
    const b = boxOf(next);
    const hit = new Set(next.base);
    for (const t of visible) {
      const at = pos(t), s = sizeOf(t);
      if (at.x < b.left + b.width && at.x + s.w > b.left && at.y < b.top + b.height && at.y + s.h > b.top) hit.add(t.id);
    }
    setPicked(hit);
  };
  const endMarquee = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (marquee?.pointerId !== e.pointerId) return;
    setMarquee(null);
  };

  // Close the tile menu on any click outside it, or on Escape.
  useEffect(() => {
    if (!menuId) return;
    const onDown = (e: PointerEvent) => {
      const root = (e.target as HTMLElement).closest('[data-menu-root]');
      if (root?.getAttribute('data-menu-root') !== menuId) setMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuId(null);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuId]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const { tiles, edges, sizes, zoom, hidden } = latest.current;
      // Pointer movement is in screen pixels; tile positions are in unscaled canvas units.
      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;
      if (!d.moved && Math.hypot(dx, dy) * zoom < 4) return;
      d.moved = true;
      const tile = tiles.find(t => t.id === d.id);
      if (!tile) {
        drag.current = null;
        setView(null);
        return;
      }
      const origin = d.origins[d.id];
      d.dx = dx;
      d.dy = dy;
      if (d.multi) {
        setView({ id: d.id, dx, dy, snap: null, moving: d.moving });
        return;
      }
      const skip = new Set([...d.moving, ...hidden, ...tiles.filter(t => t.collapsed).map(t => t.id)]);
      d.snap = findSnap(tile, { x: origin.x + dx, y: origin.y + dy }, tiles, edges, sizes, skip);
      setView({ id: d.id, dx, dy, snap: d.snap, moving: d.moving });
    };
    const onUp = () => {
      const d = drag.current;
      drag.current = null;
      if (d?.moved) latest.current.onCommitDrag({ id: d.id, origins: d.origins, dx: d.dx, dy: d.dy, snap: d.snap });
      else if (d && latest.current.chart) latest.current.toggleInChart(d.id);
      setView(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, tile: Tile) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button,input,select,textarea,[role="menu"]')) return;
    // Dragging a picked tile moves every picked tile (and the tiles linked after each); any other tile drops the picks.
    const group = picked.has(tile.id) && picked.size > 1 ? [...picked].filter(id => byId.has(id) && !hidden.has(id)) : [tile.id];
    if (!picked.has(tile.id) && picked.size) setPicked(new Set());
    const moving = new Set(group.flatMap(id => [...attachedIds(id, edges)]));
    const origins: Record<string, Point> = {};
    for (const t of tiles) if (moving.has(t.id)) origins[t.id] = { x: t.x, y: t.y };
    drag.current = { id: tile.id, startX: e.clientX, startY: e.clientY, origins, moving, moved: false, dx: 0, dy: 0, snap: null, multi: group.length > 1 };
    setMenuId(null);
  };

  /**
   * Right-click: charts and quantities start (or finish) linking tiles to them by clicking them. Other tiles
   * stack the tiles linked to their right and below behind them, or spread them back out.
   */
  const toggleStack = (e: ReactMouseEvent, tile: Tile) => {
    if ((e.target as HTMLElement).closest('input,textarea,[role="menu"],[role="dialog"]')) return;
    if (startsLinking(tile) || linkingChart === tile.id) {
      e.preventDefault();
      setMenuId(null);
      setLinkingChart(linkingChart === tile.id ? null : tile.id);
      return;
    }
    if (!canStack(tile)) return;
    e.preventDefault();
    setMenuId(null);
    onUpdateTile({ ...tile, collapsed: tile.collapsed ? undefined : true });
  };
  const canStack = (tile: Tile) => tile.collapsed || edges.some(edge => edge.from === tile.id);
  const visible = tiles.filter(t => !hidden.has(t.id));

  const pos = (t: Tile): Point =>
    view && view.moving.has(t.id) ? { x: t.x + view.dx, y: t.y + view.dy } : { x: t.x, y: t.y };
  const sizeOf = (t: Tile) => sizes[t.id] ?? defaultSize(t);
  const dragged = view ? byId.get(view.id) : undefined;

  // The board's size comes from the tiles alone. CSS (min-width/height: 100%) stretches it to fill the view, so the
  // browser handles scrollbars appearing; sizing it from a measured view size looped forever on Linux, where
  // scrollbars take up space (React error #185).
  const width = Math.max(0, ...visible.map(t => pos(t).x + sizeOf(t).w + 120));
  const height = Math.max(0, ...visible.map(t => pos(t).y + sizeOf(t).h + 160));

  // Side-by-side links join at the tile headers; stacked links join bottom edge to top edge.
  const lines = edges.flatMap((edge, i) => {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b || hidden.has(a.id) || hidden.has(b.id)) return [];
    const pa = pos(a), pb = pos(b), sa = sizeOf(a);
    const key = `${edge.from}-${edge.to}-${edge.axis}-${i}`;
    if (edge.axis === 'v') {
      const x = pa.x + Math.min(sa.w, sizeOf(b).w) / 2;
      return [{ edge, key, x1: x, y1: pa.y + sa.h, x2: x, y2: pb.y }];
    }
    return [{ edge, key, x1: pa.x + sa.w, y1: pa.y + HEAD_Y, x2: pb.x, y2: pb.y + HEAD_Y }];
  });

  return (
    <div
      className={`canvas-wrap ${marquee ? 'selecting' : ''} ${view ? 'is-dragging' : ''} ${chart ? 'chart-linking' : ''}`}
      ref={wrapRef}
      onContextMenu={openAddMenu}
      onPointerDown={e => {
        // Clicking empty board space ends linking; otherwise it starts a selection box.
        if (chart && e.button === 0 && !(e.target as HTMLElement).closest('.tile,button,input,select,textarea,a,[role="menu"],[role="dialog"]')) {
          setLinkingChart(null);
          return;
        }
        startMarquee(e);
      }}
      onPointerMove={moveMarquee}
      onPointerUp={endMarquee}
      onPointerCancel={endMarquee}
    >
      <div className="canvas-sizer" style={{ width: width * zoom, height: height * zoom }}>
      {chart ? (
        <div className="linking-banner" role="status">
          {linkingMessage(chart)}
        </div>
      ) : (
        <span className="canvas-note">Drag a tile next to or below another to link it · double-click a value to edit it · drag across the board to select tiles and move them together · right-click a tile to stack its linked tiles · + on a tile, or right-click a chart or quantity, links tiles to it · right-click the board to add a tile</span>
      )}
      {tiles.length === 0 && (
        <div className="empty-hint">
          <Sparkles size={24} />
          <b>A clear space to begin</b>
          Add an asset, then link quantities and totals to its right or below it.
        </div>
      )}
      <div className="canvas-inner" style={{ width, height, transform: `scale(${zoom})` }}>
        <svg className="connector-layer" width={width} height={height} aria-hidden="true">
          {lines.map(l => (
            <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="connector" />
          ))}
        </svg>
        {!view &&
          lines.map(l => (
            <button
              key={`unlink-${l.key}`}
              className="link-remove"
              title="Remove link"
              aria-label="Remove link"
              style={{ left: (l.x1 + l.x2) / 2 - 9, top: (l.y1 + l.y2) / 2 - 9 }}
              onClick={() => onUnlink(l.edge)}
            >
              <X size={11} />
            </button>
          ))}
        {marquee && <div className="marquee" style={boxOf(marquee)} />}
        {view?.snap && dragged && (
          <div
            className={`snap-ghost ${view.snap.axis === 'h' ? 'horizontal' : 'vertical'}`}
            style={{ left: view.snap.x, top: view.snap.y, width: sizeOf(dragged).w, height: sizeOf(dragged).h }}
          />
        )}
        {visible.map(tile =>
          tile.collapsed && edges.some(edge => edge.from === tile.id) ? (
            <div key={`stack-${tile.id}`} className="tile-stack" aria-hidden="true" style={{ left: pos(tile).x + 9, top: pos(tile).y + 9, width: sizeOf(tile).w, height: sizeOf(tile).h, '--tile-color': tile.color } as CSSProperties} />
          ) : null,
        )}
        {visible.map(tile => {
          const p = pos(tile);
          const stacked = tile.collapsed ? attachedIds(tile.id, edges).size - 1 : 0;
          const isDragged = view?.id === tile.id;
          const candidate = Boolean(dragged && !drag.current?.multi && !tile.collapsed && !view?.moving.has(tile.id) && (linkSlot(tile, dragged, tiles, edges, 'h') || linkSlot(tile, dragged, tiles, edges, 'v')));
          const target = view?.snap?.targetId === tile.id;
          const classes = [
            isDragged ? 'dragging' : '',
            view?.moving.has(tile.id) && !isDragged ? 'moving' : '',
            candidate ? 'link-candidate' : '',
            target ? `link-target ${view?.snap?.axis === 'v' ? 'link-target-v' : ''}` : '',
            chart && tile.id === chart.id ? 'chart-linking-source' : '',
            chart && isLinkedMember(chart, tile.id, tiles, edges) ? 'chart-linked chart-member' : '',
            chart && canLinkTo(chart, tile, tiles, edges) ? (isLinkedTo(chart, tile.id) ? 'chart-linked' : 'chart-linkable') : '',
            picked.has(tile.id) ? 'picked' : '',
          ].join(' ');
          return (
            <TileCard
              key={tile.id}
              tile={tile}
              byId={byId}
              calc={calc}
              x={p.x}
              y={p.y}
              className={classes}
              stacked={stacked}
              onContextMenu={e => toggleStack(e, tile)}
              menuOpen={menuId === tile.id}
              tileRef={tileRef(tile.id)}
              onPointerDown={e => startDrag(e, tile)}
              onOpenOptions={() => {
                setMenuId(null);
                onOpenOptions(tile.id);
              }}
              onToggleMenu={() => setMenuId(menuId === tile.id ? null : tile.id)}
              onDelete={() => {
                setMenuId(null);
                onDelete(tile.id);
              }}
              linking={linkingChart === tile.id}
              onAdd={() => {
                setMenuId(null);
                setLinkingChart(linkingChart === tile.id ? null : tile.id);
              }}
              onToggleStack={startsLinking(tile) && canStack(tile) ? () => {
                setMenuId(null);
                onUpdateTile({ ...tile, collapsed: tile.collapsed ? undefined : true });
              } : undefined}
              onUpdate={onUpdateTile}
            />
          );
        })}
      </div>
      </div>
      {addMenu && (
        <div ref={addMenuRef} className="tile-menu add-menu" role="menu" aria-label="Add a tile" style={{ left: addMenu.left, top: addMenu.top }} onContextMenu={e => e.preventDefault()}>
          <div className="add-menu-label">Add a tile here</div>
          {addOptions.map(o => (
            <button
              key={o.key}
              role="menuitem"
              onClick={() => {
                setAddMenu(null);
                o.onPick(addMenu.at);
              }}
            >
              {o.icon} {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
