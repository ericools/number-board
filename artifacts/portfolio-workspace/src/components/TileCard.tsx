import { Activity, BriefcaseBusiness, Grip, Hash, Layers, MoreHorizontal, PieChart, Plus, Settings2, SquareStack, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode, Ref } from 'react';
import { evaluateExpression, referencedIds } from '../workspace/calc';
import type { Calculator } from '../workspace/calc';
import { FitText } from './FitText';
import { InlineEdit, parseNumber } from './InlineEdit';
import { PERIODS, TILE_COLORS, assetTypeOf, isLiveType, logoOf, logoSrc, money, nice, percent, tileName } from '../workspace/model';
import { timeOf } from '../workspace/prices';
import type { Kind, Tile } from '../workspace/model';

export const KIND_ICON: Record<Exclude<Kind, 'asset'>, ReactNode> = {
  quantity: <Hash />,
  sum: <Layers />,
  total: <BriefcaseBusiness />,
  interest: <Activity />,
  group: <Grip />,
  chart: <PieChart />,
};

const PERIOD_SHORT: Record<string, string> = { day: 'day', week: 'wk', month: 'mo', quarter: 'qtr', year: 'yr' };

export const AssetSigil = ({ symbol, color }: { symbol?: string; color: string }) => (
  <span className="asset-sigil" style={{ '--tile-color': color } as CSSProperties}>{symbol?.slice(0, 3)}</span>
);

export const LogoImage = ({ logo }: { logo: string }) => <img className="tile-logo" src={logoSrc(logo)} alt="" draggable={false} />;

/** Custom/bundled logo if there is one, otherwise the asset sigil or the tile-type icon. */
export const TileIcon = ({ tile }: { tile: Tile }) => {
  const logo = logoOf(tile);
  if (logo) return <LogoImage logo={logo} />;
  return tile.kind === 'asset' ? <AssetSigil symbol={tile.symbol} color={tile.color} /> : <>{KIND_ICON[tile.kind]}</>;
};

type Props = {
  tile: Tile;
  byId: Map<string, Tile>;
  calc: Calculator;
  x: number;
  y: number;
  className: string;
  /** Number of tiles stacked behind this one (right-click collapsed). */
  stacked: number;
  onContextMenu: (e: MouseEvent<HTMLDivElement>) => void;
  menuOpen: boolean;
  tileRef: Ref<HTMLDivElement>;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onOpenOptions: () => void;
  onToggleMenu: () => void;
  onDelete: () => void;
  /** Stack or spread out the linked tiles (offered in the menu for tiles whose right-click starts linking). */
  onToggleStack?: () => void;
  /** True while this tile is in linking mode (its + is pressed). */
  linking: boolean;
  /** The + button: start or finish linking tiles to this one by clicking them. */
  onAdd: () => void;
  onUpdate: (tile: Tile) => void;
};

export function TileCard({ tile, byId, calc, x, y, className, stacked, onContextMenu, menuOpen, tileRef, onPointerDown, onOpenOptions, onToggleMenu, onDelete, onToggleStack, linking, onAdd, onUpdate }: Props) {
  const nameOf = (id: string) => (byId.get(id) ? tileName(byId.get(id)!) : 'missing tile');
  const value = calc.valueOf(tile.id);
  const addButton = (
    <button className={`tile-add ${linking ? 'active' : ''}`} title={linking ? 'Finish adding tiles' : 'Add tiles: click the tiles to include'} aria-label={`Add tiles to ${tileName(tile)}`} aria-pressed={linking} onClick={onAdd}>
      <Plus size={14} />
    </button>
  );

  const assetType = tile.kind === 'asset' ? assetTypeOf(tile) : '';

  /** Inline edits: save a typed number into a field, rejecting text that isn't one. */
  const commitNumber = (field: 'price' | 'rate', min?: number) => (text: string) => {
    const n = parseNumber(text);
    if (!Number.isFinite(n) || (min !== undefined && n < min)) return false;
    if (n !== tile[field]) onUpdate({ ...tile, [field]: n });
    return true;
  };
  const commitExpression = (text: string) => {
    // A typed $ turns on the tile's dollar sign instead of staying in the formula.
    const dollar = Boolean(tile.dollar || text.includes('$') || (tile.expression ?? '').includes('$')) || undefined;
    const expression = text.replace(/\$/g, '').trim();
    if (!Number.isFinite(evaluateExpression(expression, calc.valueOf))) return false;
    if (expression !== tile.expression || dollar !== tile.dollar) onUpdate({ ...tile, expression, dollar });
    return true;
  };
  /** Shown on the top line after the title. */
  const headNote = (() => {
    if (tile.kind === 'asset') {
      if (isLiveType(assetType)) return tile.priceAt ? <span className="tile-note" title={`Live price as of ${timeOf(tile.priceAt)}`}>{timeOf(tile.priceAt)}</span> : <span className="tile-note">waiting for price</span>;
      return null;
    }
    if (tile.kind === 'interest' && tile.dashNode) {
      return <span className="tile-note" title={`Live yield from mnowatch.org${tile.rateAt ? ` as of ${timeOf(tile.rateAt)}` : ''}`}>{tile.dashNode === 'evonode' ? 'Evonode' : 'Regular'}</span>;
    }
    return null;
  })();

  const body = (() => {
    switch (tile.kind) {
      case 'asset': {
        const quantity = calc.assetQuantity(tile);
        const price = tile.price === undefined ? '—' : money(tile.price);
        return (
          <div className="asset-fields">
            <div className="asset-field">
              <span>Unit price</span>
              {/* Live prices are replaced by the feed, so only fixed prices can be typed in. */}
              {isLiveType(assetType) ? (
                <b><FitText>{price}</FitText></b>
              ) : (
                <InlineEdit label={`Unit price of ${tileName(tile)}`} value={String(tile.price ?? '')} onCommit={commitNumber('price')}>
                  <b><FitText>{price}</FitText></b>
                </InlineEdit>
              )}
            </div>
            <div className="asset-field">
              <span>Quantity</span>
              <b><FitText>{nice(quantity)}</FitText></b>
            </div>
            <div className="asset-field">
              <span>Value</span>
              <b><FitText>{money((tile.price ?? 0) * quantity)}</FitText></b>
            </div>
          </div>
        );
      }
      case 'quantity': {
        const shown = <div className="tile-main"><FitText>{calc.isCurrency(tile.id) ? money(value) : nice(value)}</FitText></div>;
        // Formulas that point at other tiles are edited in the options window, where tiles can be picked by name.
        if (referencedIds(tile.expression ?? '').length) return shown;
        return (
          <InlineEdit className="tile-main-input" label={`Value of ${tileName(tile)}`} value={(tile.expression ?? '').replace(/\$/g, '')} onCommit={commitExpression}>
            {shown}
          </InlineEdit>
        );
      }
      case 'total':
        return <div className="tile-main"><FitText>{money(value)}</FitText></div>;
      case 'interest': {
        const interestText = calc.isCurrency(tile.id) ? money(value) : `${nice(value)}${tile.dashNode ? ' DASH' : ''}`;
        const period = PERIODS.find(p => p.value === tile.period)?.label.toLowerCase() ?? 'year';
        const rateBadge = (
          <span className="tile-rate" title={`${nice(tile.rate ?? 0)}% per ${period}`}>
            {tile.rate === undefined ? '—' : `${nice(tile.rate)}%`}<small>/{PERIOD_SHORT[period] ?? period}</small>
          </span>
        );
        return (
          <div className="tile-main-row interest-row">
            <div className="tile-main" title={tile.dashNode && calc.isCurrency(tile.id) ? 'Masternode reward in dollars at the Dash price' : undefined}><FitText>{interestText}</FitText></div>
            {tile.dashNode ? rateBadge : (
              <InlineEdit className="rate-input" label={`Interest rate of ${tileName(tile)}`} value={String(tile.rate ?? '')} onCommit={commitNumber('rate')}>
                {rateBadge}
              </InlineEdit>
            )}
          </div>
        );
      }
      case 'sum': {
        // Linked into a chain, a sum adds up its chain's quantities by itself; picking tiles only applies on its own.
        const chained = calc.sumInputs(tile).linked;
        return (
          <div className="tile-main-row">
            <div className="tile-main"><FitText>{calc.isCurrency(tile.id) ? money(value) : nice(value)}</FitText></div>
            {!chained && addButton}
          </div>
        );
      }
      case 'group': {
        // Picked tiles plus the assets linked below the group, each once.
        const ids = calc.includedIds(tile);
        // Assets count at their Value field (price × quantity), like on pie charts.
        return (
          <>
            <div className="tile-main-row">
              <div className="tile-main"><FitText>{calc.isCurrency(tile.id) ? money(value) : nice(value)}</FitText></div>
              {addButton}
            </div>
            {ids.length > 0 && (
              <div className="group-rows">
                {ids.map(id => (
                  <div className="group-row" key={id}>
                    <span>{nameOf(id)}</span>
                    <b><FitText>{calc.isCurrency(id) ? money(calc.chartValue(id)) : nice(calc.chartValue(id))}</FitText></b>
                  </div>
                ))}
              </div>
            )}
          </>
        );
      }
      case 'chart':
        return <ChartBody tile={tile} byId={byId} calc={calc} nameOf={nameOf} onUpdate={onUpdate} />;
    }
  })();

  return (
    <div
      ref={tileRef}
      data-tile-id={tile.id}
      data-testid={`tile-${tile.id}`}
      className={`tile tile-${tile.kind} ${stacked ? 'stacked' : ''} ${className}`}
      title={stacked ? `${stacked} linked tile${stacked === 1 ? '' : 's'} stacked behind · ${onToggleStack ? 'use the … menu' : 'right-click'} to spread out` : undefined}
      onContextMenu={onContextMenu}
      style={{ left: x, top: y, '--tile-color': tile.color } as CSSProperties}
      onPointerDown={onPointerDown}
      onDoubleClick={onOpenOptions}
    >
      <div className="tile-head">
        <div className="tile-label">
          <TileIcon tile={tile} />
          <span className="tile-title">{tile.title}</span>
          {headNote}
        </div>
        <div className="tile-head-actions" data-menu-root={tile.id}>
          {(tile.kind === 'chart' || tile.kind === 'asset' || tile.dashNode) && addButton}
          <button className="tile-menu-button" title="Tile options" aria-label={`Options for ${tileName(tile)}`} aria-expanded={menuOpen} onClick={onToggleMenu}>
            <MoreHorizontal size={17} />
          </button>
          {menuOpen && (
            <div className="tile-menu" role="menu">
              <button role="menuitem" onClick={onOpenOptions}><Settings2 size={13} /> Edit tile</button>
              {onToggleStack && <button role="menuitem" onClick={onToggleStack}><SquareStack size={13} /> {tile.collapsed ? 'Spread out linked tiles' : 'Stack linked tiles'}</button>}
              <button role="menuitem" className="danger" onClick={onDelete}><Trash2 size={13} /> Delete tile</button>
            </div>
          )}
        </div>
      </div>
      {body}
    </div>
  );
}

/** Slice colour for an included tile: the chart's override, else the colour of the tile the figure comes from. */
const sliceColor = (chart: Tile, id: string, byId: Map<string, Tile>, i: number) =>
  chart.chartColors?.[id] ?? byId.get(id)?.color ?? TILE_COLORS[i % TILE_COLORS.length];

function ChartBody({ tile, byId, calc, nameOf, onUpdate }: { tile: Tile; byId: Map<string, Tile>; calc: Calculator; nameOf: (id: string) => string; onUpdate: (tile: Tile) => void }) {
  const [picking, setPicking] = useState<string | null>(null);
  const popover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picking) return;
    const onDown = (e: globalThis.PointerEvent) => !popover.current?.contains(e.target as Node) && setPicking(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(null);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [picking]);

  const ids = tile.selected ?? [];
  // Assets count at their Value field (price × quantity), not their unit price.
  const values = ids.map(id => Math.max(0, calc.chartValue(id)));
  const total = values.reduce((a, b) => a + b, 0);
  const colors = ids.map((id, i) => sliceColor(tile, id, byId, i));
  let acc = 0;
  const stops = total
    ? values.map((v, i) => {
        const start = (acc / total) * 360;
        acc += v;
        return `${colors[i]} ${start}deg ${(acc / total) * 360}deg`;
      }).join(', ')
    : '#2b4670 0deg 360deg';
  const setColor = (id: string, color?: string) => {
    const next = { ...tile.chartColors };
    if (color) next[id] = color;
    else delete next[id];
    onUpdate({ ...tile, chartColors: next });
  };
  const SHOWN = 8;
  return (
    <div className="chart-body">
      <div className="chart-disc" style={{ background: `conic-gradient(${stops})` }} />
      <div className="chart-legend">
        {ids.slice(0, SHOWN).map((id, i) => (
          <div className="legend-item" key={id}>
            <button
              className="legend-row"
              title="Double-click to change this slice's colour"
              onDoubleClick={e => {
                e.stopPropagation();
                setPicking(id);
              }}
            >
              <span className="legend-dot" style={{ background: colors[i] }} />
              <span className="legend-name">{nameOf(id)}</span>
              <b>{total ? percent((values[i] / total) * 100) : '0%'}</b>
            </button>
            {picking === id && (
              <div className="legend-picker" ref={popover} role="dialog" aria-label={`Colour for ${nameOf(id)}`} onDoubleClick={e => e.stopPropagation()}>
                <div className="legend-swatches">
                  {TILE_COLORS.map(c => (
                    <button key={c} className={`legend-swatch ${colors[i] === c ? 'selected' : ''}`} style={{ background: c }} aria-label={`Use ${c}`} onClick={() => { setColor(id, c); setPicking(null); }} />
                  ))}
                </div>
                <div className="legend-picker-row">
                  <label className="legend-custom">
                    Custom <input type="color" value={colors[i]} onChange={e => setColor(id, e.target.value)} />
                  </label>
                  <button className="legend-reset" onClick={() => { setColor(id); setPicking(null); }}>Use tile colour</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {ids.length > SHOWN && <span className="legend-more">+{ids.length - SHOWN} more</span>}
        {ids.length === 0 && <span className="legend-more">Use + to add tiles</span>}
      </div>
    </div>
  );
}
