import { CircleDollarSign, FolderOpen, KeyRound, Minus, PieChart, Plus, RefreshCw, Save, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Canvas } from './components/Canvas';
import type { AddOption, DragCommit } from './components/Canvas';
import { KIND_ICON } from './components/TileCard';
import { AssetDialog } from './components/dialogs/AssetDialog';
import { TileDialog } from './components/dialogs/TileDialog';
import { LoadDialog, SaveDialog } from './components/dialogs/WorkspaceDialogs';
import { IS_DESKTOP, StockKeyDialog } from './components/dialogs/StockKeyDialog';
import { attachedIds, createCalculator, defaultSize, findFreeSpot, pushBelow } from './workspace/calc';
import { DASH_COLOR, DEFAULT_KIND_COLOR, H_GAP, V_GAP, MAX_ZOOM, MIN_ZOOM, logoSrc, newId } from './workspace/model';
import type { Edge, Kind, Size, Tile } from './workspace/model';
import { cachedDashYield, dashRate, timeOf } from './workspace/prices';
import { useLivePrices } from './workspace/useLivePrices';
import type { FeedStatus, LiveStatus } from './workspace/useLivePrices';
import { useWorkspaces } from './workspace/useWorkspaces';

/** Where a new tile goes: a spot on the board (from the right-click menu), else the first free slot. */
type Spot = { x: number; y: number };

type Dialog =
  | { type: 'asset'; at?: Spot }
  | { type: 'create'; tile: Tile }
  | { type: 'edit'; id: string }
  | { type: 'save' }
  | { type: 'load' }
  | { type: 'stockKey' };

const BUILD_KINDS: Exclude<Kind, 'asset' | 'chart'>[] = ['quantity', 'sum', 'total', 'interest', 'group'];
const FEED_LABEL: Record<keyof LiveStatus, string> = { crypto: 'Crypto', stocks: 'Stocks', commodities: 'Metals & oil', dash: 'Dash yield' };

const BUILD_LABEL: Record<(typeof BUILD_KINDS)[number], string> = { quantity: 'Quantity', sum: 'Sum', total: 'Total', interest: 'Interest', group: 'Group' };

function App() {
  const store = useWorkspaces();
  const { active: workspace, update } = store;
  const { tiles, edges } = workspace;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const calc = useMemo(() => createCalculator(tiles, edges), [tiles, edges]);
  // Keep tiles linked below a tile clear of it when it grows (pushBelow only moves tiles down, so this settles).
  useEffect(() => {
    if (!pushBelow(tiles, edges, sizes)) return;
    update(w => ({ ...w, tiles: pushBelow(w.tiles, w.edges, sizes) ?? w.tiles }));
  }, [tiles, edges, sizes, update]);
  const [priceRefresh, setPriceRefresh] = useState(0);
  const live = useLivePrices(tiles, update, priceRefresh);
  const close = () => setDialog(null);
  const refreshPrices = () => setPriceRefresh(n => n + 1);
  // F5 refreshes prices instead of reloading the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F5') return;
      e.preventDefault();
      if (!e.repeat) setPriceRefresh(n => n + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const failedFeeds = (Object.keys(FEED_LABEL) as (keyof LiveStatus)[]).filter(k => live[k].state === 'error');
  const refreshTitle = failedFeeds.length
    ? `Last refresh failed — ${failedFeeds.map(k => `${FEED_LABEL[k]}: ${live[k].message ?? 'unavailable'}`).join('; ')}`
    : 'Update prices now (F5)';

  const addTile = (tile: Tile) => update(w => ({ ...w, tiles: [...w.tiles, tile] }));
  const replaceTile = (tile: Tile) => update(w => ({ ...w, tiles: w.tiles.map(t => (t.id === tile.id ? tile : t)) }));
  const deleteTile = (id: string) =>
    update(w => ({
      ...w,
      tiles: w.tiles
        .filter(t => t.id !== id)
        .map(t => ({
          ...t,
          selected: t.selected?.filter(s => s !== id),
          quantityIds: t.quantityIds?.filter(s => s !== id),
          assetId: t.assetId === id ? undefined : t.assetId,
        })),
      edges: w.edges.filter(e => e.from !== id && e.to !== id),
    }));

  const startCreate = (kind: Kind, at?: Spot) => {
    const spot = at ?? findFreeSpot(tiles, sizes, kind);
    const tile: Tile = {
      id: newId(),
      kind,
      title: '',
      color: DEFAULT_KIND_COLOR[kind],
      ...spot,
      ...(kind === 'quantity' ? { expression: '' } : {}),
      ...(kind === 'interest' ? { rate: 4, period: 'year' } : {}),
      ...(kind === 'sum' || kind === 'group' || kind === 'chart' || kind === 'interest' ? { selected: [] } : {}),
    };
    setDialog({ type: 'create', tile });
  };

  /** An interest tile whose rate follows the live Dash masternode yield (regular by default). */
  const startDashMasternode = (at?: Spot) => {
    const known = cachedDashYield();
    setDialog({
      type: 'create',
      tile: {
        id: newId(),
        kind: 'interest',
        title: 'Dash masternode',
        color: DASH_COLOR,
        dashNode: 'regular',
        rate: known ? dashRate(known, 'regular') : undefined,
        rateAt: known?.at,
        period: 'year',
        selected: [],
        ...(at ?? findFreeSpot(tiles, sizes, 'interest')),
      },
    });
  };

  /** When a link is removed, the child must stop using the old parent as an input. */
  const forgetParent = (tile: Tile, parentId: string): Tile =>
    tile.kind === 'interest' && tile.selected?.includes(parentId) ? { ...tile, selected: tile.selected.filter(s => s !== parentId) } : tile;

  const commitDrag = ({ id, origins, dx, dy, snap }: DragCommit) => {
    const origin = origins[id];
    const final = snap ? { x: snap.x, y: snap.y } : { x: origin.x + dx, y: origin.y + dy };
    const fdx = final.x - origin.x;
    const fdy = final.y - origin.y;
    update(w => {
      // A tile has at most one parent link. Dropping it away from everything detaches it. When several picked tiles
      // move together, links among them stay and links from tiles left behind break.
      const cut = w.edges.filter(e => origins[e.to] && !origins[e.from]);
      let edges = w.edges.filter(e => !cut.includes(e));
      let tiles = w.tiles.map(t => (origins[t.id] ? { ...t, x: Math.max(0, origins[t.id].x + fdx), y: Math.max(0, origins[t.id].y + fdy) } : t));
      if (snap?.insertBefore) {
        // Slide into the chain: target → dragged → previous neighbour, and push the rest of the chain right (or down).
        const after = snap.insertBefore;
        const axis = snap.axis;
        edges = [...edges.filter(e => !(e.from === snap.targetId && e.to === after && e.axis === axis)), { from: snap.targetId, to: id, axis }, { from: id, to: after, axis }];
        const size = sizes[id] ?? defaultSize(w.tiles.find(t => t.id === id)!);
        const shift = axis === 'h' ? size.w + H_GAP : size.h + V_GAP;
        const pushed = attachedIds(after, edges);
        tiles = tiles.map(t => (pushed.has(t.id) && !origins[t.id] ? (axis === 'h' ? { ...t, x: t.x + shift } : { ...t, y: t.y + shift }) : t));
      } else if (snap) {
        edges = [...edges, { from: snap.targetId, to: id, axis: snap.axis }];
      }
      for (const e of cut) if (!(e.to === id && snap?.targetId === e.from)) tiles = tiles.map(t => (t.id === e.to ? forgetParent(t, e.from) : t));
      return { ...w, tiles, edges };
    });
  };

  const unlink = (edge: Edge) =>
    update(w => ({
      ...w,
      tiles: w.tiles.map(t => (t.id === edge.to ? forgetParent(t, edge.from) : t)),
      edges: w.edges.filter(e => !(e.from === edge.from && e.to === edge.to && e.axis === edge.axis)),
    }));

  const zoom = workspace.zoom ?? 1;
  /** Steps the tile scale by `delta`, reading the current value inside the update so rapid wheel steps add up. */
  const stepZoom = (delta: number) =>
    update(w => {
      const next = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (w.zoom ?? 1) + delta)) * 10) / 10;
      return next === (w.zoom ?? 1) ? w : { ...w, zoom: next };
    });

  const addOptions: AddOption[] = [
    { key: 'asset', label: 'Asset', icon: <CircleDollarSign />, onPick: at => setDialog({ type: 'asset', at }) },
    ...BUILD_KINDS.map(kind => ({ key: kind, label: BUILD_LABEL[kind], icon: KIND_ICON[kind], onPick: (at: Spot) => startCreate(kind, at) })),
    { key: 'dash', label: 'Dash masternode', icon: <img className="tool-logo" src={logoSrc('crypto/dash.png')} alt="" />, onPick: startDashMasternode },
    { key: 'chart', label: 'Pie chart', icon: <PieChart />, onPick: at => startCreate('chart', at) },
  ];

  const editing = dialog?.type === 'edit' ? tiles.find(t => t.id === dialog.id) : undefined;
  const savedAt = new Date(workspace.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="app">
      <main className="content">
        <header className="page-heading">
          <div>
            <div className="eyebrow">Your money, mapped out</div>
            <h1>{workspace.name}</h1>
          </div>
          <div className="heading-actions">
            <button className={`soft-button refresh-button ${failedFeeds.length ? 'failed' : ''}`} title={refreshTitle} aria-busy={live.busy} onClick={refreshPrices}>
              <RefreshCw size={15} className={live.busy ? 'spin' : ''} /> {failedFeeds.length ? 'Refresh failed' : 'Refresh prices'}
            </button>
            <button className="soft-button" onClick={() => setDialog({ type: 'save' })}><Save size={15} /> Save</button>
            <button className="soft-button" onClick={() => setDialog({ type: 'load' })}><FolderOpen size={15} /> Load</button>
            {IS_DESKTOP && <button className="soft-button" onClick={() => setDialog({ type: 'stockKey' })}><KeyRound size={15} /> Stock price key</button>}
          </div>
        </header>

        <div className="toolbar">
          <div className="tool-group">
            <span className="tool-label">Add a tile</span>
            <button className="soft-button" onClick={() => setDialog({ type: 'asset' })}><CircleDollarSign size={14} /> Asset</button>
            {BUILD_KINDS.map(kind => (
              <button key={kind} className="soft-button tool-kind" onClick={() => startCreate(kind)}>{KIND_ICON[kind]} {BUILD_LABEL[kind]}</button>
            ))}
            <button className="soft-button" onClick={() => startDashMasternode()}>
              <img className="tool-logo" src={logoSrc('crypto/dash.png')} alt="" /> Dash masternode
            </button>
          </div>
          <div className="toolbar-end">
            <button className="soft-button" onClick={() => startCreate('chart')}><Plus size={14} /> Pie chart</button>
            <div className="zoom-group" role="group" aria-label="Tile size">
              <button className="soft-button" title="Smaller tiles" aria-label="Make tiles smaller" disabled={zoom <= MIN_ZOOM} onClick={() => stepZoom(-0.1)}><Minus size={15} /></button>
              <span className="zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button className="soft-button" title="Larger tiles" aria-label="Make tiles larger" disabled={zoom >= MAX_ZOOM} onClick={() => stepZoom(0.1)}><Plus size={15} /></button>
            </div>
          </div>
        </div>

        <Canvas
          tiles={tiles}
          edges={edges}
          calc={calc}
          zoom={zoom}
          sizes={sizes}
          onSizes={setSizes}
          onCommitDrag={commitDrag}
          onZoomStep={stepZoom}
          onUpdateTile={replaceTile}
          onUnlink={unlink}
          onOpenOptions={id => setDialog({ type: 'edit', id })}
          onDelete={deleteTile}
          addOptions={addOptions}
        />

        <div className="status-row">
          {store.saveError ? (
            <span className="autosave error"><TriangleAlert size={13} /> Couldn’t save changes in this browser: {store.saveError}</span>
          ) : (
            <span className="autosave"><span className="online-dot" /> All changes saved automatically · last saved {savedAt}</span>
          )}
          <span className="footer-note">
            <ShieldCheck size={13} />
            <FeedNote label="Crypto (CoinCodex)" status={live.crypto} /> · <FeedNote label="Stocks (Finnhub)" status={live.stocks} /> ·{' '}
            <FeedNote label="Metals & oil (OilPriceAPI)" status={live.commodities} /> ·{' '}
            <FeedNote label="Dash yield (mnowatch.org)" status={live.dash} /> · euro uses a sample rate
          </span>
        </div>
        <footer className="credits">Created by: @Ageofdoge DashPay - @evilduck92 X</footer>
      </main>

      {dialog?.type === 'asset' && (
        <AssetDialog
          onClose={close}
          onCreate={a => {
            addTile({ id: newId(), kind: 'asset', title: a.name, symbol: a.symbol, assetType: a.type, price: a.price, priceAt: a.priceAt, quantity: a.quantity, currency: 'USD', color: a.color, ...(dialog.at ?? findFreeSpot(tiles, sizes, 'asset')) });
            close();
          }}
        />
      )}
      {dialog?.type === 'create' && (
        <TileDialog mode="create" tile={dialog.tile} tiles={tiles} edges={edges} calc={calc} onClose={close} onSave={t => { addTile(t); close(); }} />
      )}
      {dialog?.type === 'edit' && editing && (
        <TileDialog
          key={editing.id}
          mode="edit"
          tile={editing}
          tiles={tiles}
          edges={edges}
          calc={calc}
          onClose={close}
          onSave={t => { replaceTile(t); close(); }}
          onDelete={() => { deleteTile(editing.id); close(); }}
        />
      )}
      {dialog?.type === 'stockKey' && <StockKeyDialog onClose={close} onChanged={refreshPrices} />}
      {dialog?.type === 'save' && (
        <SaveDialog
          workspace={workspace}
          onClose={close}
          onSave={name => { store.rename(name); close(); }}
        />
      )}
      {dialog?.type === 'load' && (
        <LoadDialog
          workspaces={store.workspaces}
          activeId={workspace.id}
          onClose={close}
          onLoad={id => { store.load(id); close(); }}
          onDelete={store.remove}
          onCreateBlank={() => { store.createBlank('Untitled workspace'); close(); }}
          onOpenFile={ws => { store.importWorkspace(ws); close(); }}
        />
      )}
    </div>
  );
}

function FeedNote({ label, status }: { label: string; status: FeedStatus }) {
  if (status.state === 'idle') return <span>{label}: live when added</span>;
  if (status.state === 'loading') return <span>{label}: loading…</span>;
  if (status.state === 'error') return <span className="feed-error" title={status.message}>{label} unavailable: {status.message}</span>;
  return <span title={status.message}>{label} live · checked {timeOf(status.at)}{status.message ? ' (some symbols missing)' : ''}</span>;
}

export default App;
