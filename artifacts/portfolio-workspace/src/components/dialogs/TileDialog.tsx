import { ImagePlus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { evaluateExpression, referencedIds } from '../../workspace/calc';
import type { Calculator } from '../../workspace/calc';
import { DASH_NODE_LABEL, KIND_LABEL, PERIODS, TILE_COLORS, assetTypeOf, isLiveType, logoOf, logoSrc, money, nice, tileName } from '../../workspace/model';
import type { DashNode, Edge, Tile } from '../../workspace/model';
import { canLinkTo } from '../../workspace/linking';
import { FEED_INFO, cachedDashYield, dashRate, fetchDashYield, timeOf } from '../../workspace/prices';
import type { DashYield } from '../../workspace/prices';
import { Modal, TilePicker, toggleId } from './Modal';

const SUBTITLES: Record<Tile['kind'], string> = {
  asset: 'A price per unit, plus the total quantity and value of its chain. Link quantities and totals to its right or below it.',
  quantity: 'A number or formula. Use + − × ÷, parentheses, and other tile values. Turn on the $ button to show it as a dollar amount.',
  sum: 'Linked into a chain, it adds up every quantity in that chain, side by side or stacked. On its own, it adds the tiles you include.',
  total: 'Asset price × every quantity in its chain, side by side or stacked, before or after it.',
  group: 'Combined value, with each included tile’s value listed. It can also be linked into a chain like a quantity.',
  interest: 'Shows the interest for the chosen period. It doesn’t change any other tile.',
  chart: 'A pie chart of the tiles you include.',
};

type Props = {
  mode: 'create' | 'edit';
  tile: Tile;
  tiles: Tile[];
  edges: Edge[];
  calc: Calculator;
  onClose: () => void;
  onSave: (tile: Tile) => void;
  onDelete?: () => void;
};

export function TileDialog({ mode, tile, tiles, edges, calc, onClose, onSave, onDelete }: Props) {
  // Older quantities kept a typed $ in the formula; it now lives on the $ toggle instead.
  const [draft, setDraft] = useState<Tile>(() =>
    tile.kind === 'quantity' && (tile.expression ?? '').includes('$') ? { ...tile, expression: (tile.expression ?? '').replace(/\$/g, '').trim(), dollar: true } : tile,
  );
  const [ref, setRef] = useState('');
  const set = (patch: Partial<Tile>) => setDraft(d => ({ ...d, ...patch }));
  const others = tiles.filter(t => t.id !== tile.id);
  const pickable = others.filter(t => t.kind !== 'chart');
  const totalLinks = draft.kind === 'total' ? calc.totalInputs(draft) : null;
  const interestLinks = draft.kind === 'interest' ? calc.interestBasis(draft) : null;
  const preview = draft.kind === 'quantity' ? evaluateExpression(draft.expression ?? '', calc.valueOf) : 0;
  const previewIsMoney = Boolean(draft.dollar) || (draft.expression ?? '').includes('$') || referencedIds(draft.expression ?? '').some(calc.isCurrency);
  const [logoError, setLogoError] = useState<string | null>(null);
  const isDash = draft.kind === 'interest' && Boolean(draft.dashNode);
  const [dashYield, setDashYield] = useState<DashYield | null>(cachedDashYield);
  const [dashError, setDashError] = useState<string | null>(null);
  useEffect(() => {
    if (!isDash) return;
    fetchDashYield()
      .then(y => {
        setDashYield(y);
        setDraft(d => (d.dashNode ? { ...d, rate: dashRate(y, d.dashNode), rateAt: y.at } : d));
      })
      .catch(err => setDashError(err instanceof Error ? err.message : 'Request failed'));
  }, [isDash]);
  const chooseNode = (node: DashNode) => set({ dashNode: node, ...(dashYield ? { rate: dashRate(dashYield, node), rateAt: dashYield.at } : {}) });
  const logo = logoOf(draft);

  const chooseLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      set({ logo: await shrinkImage(file, 96) });
      setLogoError(null);
    } catch {
      setLogoError('That file couldn’t be read as an image. Try a PNG, JPG, SVG, or WebP.');
    }
  };

  return (
    <Modal
      title={mode === 'create' ? `New ${KIND_LABEL[draft.kind].toLowerCase()} tile` : `${KIND_LABEL[draft.kind]} options`}
      subtitle={SUBTITLES[draft.kind]}
      onClose={onClose}
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="tile-title">Title (optional)</label>
          <input id="tile-title" autoFocus value={draft.title} placeholder="Leave blank for no title" onChange={e => set({ title: e.target.value })} />
        </div>

        {draft.kind === 'asset' && (
          <div className="field">
            <label htmlFor="tile-price">{isLiveType(assetTypeOf(draft)) ? 'Live unit price (USD)' : 'Unit price (USD)'}</label>
            <input id="tile-price" type="number" value={draft.price ?? 0} disabled={isLiveType(assetTypeOf(draft))} onChange={e => set({ price: Number(e.target.value) })} />
            <div className="field-help">
              {isLiveType(assetTypeOf(draft))
                ? `Updated ${FEED_INFO[assetTypeOf(draft)].every} from ${FEED_INFO[assetTypeOf(draft)].name}.`
                : assetTypeOf(draft) === 'Other' ? 'Your own price. You can also double-click it on the tile to change it.' : 'Fixed price; you can change it.'}
            </div>
          </div>
        )}

        {draft.kind === 'asset' && (
          <div className="field">
            <label htmlFor="tile-quantity">Quantity</label>
            <input id="tile-quantity" type="number" step="any" value={draft.quantity ?? ''} placeholder="0" onChange={e => set({ quantity: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <div className="field-help">
              {(() => {
                const linked = calc.assetQuantity({ ...draft, quantity: 0 });
                const total = (draft.quantity ?? 0) + linked;
                return linked
                  ? `Units held, added to the ${nice(linked)} from quantities in its chain: ${nice(total)} in total, worth ${money(total * (draft.price ?? 0))}.`
                  : `Units held, worth ${money(total * (draft.price ?? 0))}. Quantities linked in its chain are added to this.`;
              })()}
            </div>
          </div>
        )}

        {draft.kind === 'quantity' && (
          <>
            <div className="field">
              <label htmlFor="tile-expr">Value or formula</label>
              <div className="dollar-row">
                <button
                  type="button"
                  className={`dollar-toggle ${draft.dollar ? 'on' : ''}`}
                  aria-pressed={Boolean(draft.dollar)}
                  aria-label="Show a dollar sign"
                  title={draft.dollar ? 'Shown as a dollar amount · click to remove the $' : 'Click to show this as a dollar amount'}
                  onClick={() => set({ dollar: draft.dollar ? undefined : true })}
                >
                  $
                </button>
                <input id="tile-expr" value={draft.expression ?? ''} placeholder="e.g. 3 * 12 or 250" onChange={e => set({ expression: e.target.value.replace(/\$/g, ''), ...(e.target.value.includes('$') ? { dollar: true } : {}) })} />
              </div>
              <div className={`field-help ${Number.isFinite(preview) ? '' : 'error'}`}>
                {Number.isFinite(preview) ? `Result: ${previewIsMoney ? money(preview) : nice(preview)}` : 'This formula can’t be calculated — check the operators and brackets.'}
              </div>
            </div>
            <div className="field">
              <label htmlFor="tile-ref">Use another tile’s value</label>
              <div className="inline-row">
                <select id="tile-ref" value={ref} onChange={e => setRef(e.target.value)}>
                  <option value="">Choose a tile…</option>
                  {others.map(t => <option key={t.id} value={t.id}>{tileName(t)} · {KIND_LABEL[t.kind]}</option>)}
                </select>
                <button className="soft-button" disabled={!ref} onClick={() => set({ expression: insertReference(draft.expression ?? '', ref) })}>Insert</button>
              </div>
            </div>
          </>
        )}

        {draft.kind === 'total' && totalLinks && (
          <div className="field-help note">
            {totalLinks.linked
              ? `Uses its whole chain: ${totalLinks.asset ? tileName(totalLinks.asset) : 'no asset'} × ${totalLinks.quantities.length} ${totalLinks.quantities.length === 1 ? 'quantity' : 'quantities'}.`
              : 'Not linked yet, so its value is $0. Drag it to the right of a quantity in an asset chain to link it.'}
          </div>
        )}

        {draft.kind === 'interest' && interestLinks && (
          <>
            {isDash && (
              <div className="field">
                <label>Masternode type</label>
                <div className="node-options" role="radiogroup" aria-label="Masternode type">
                  {(['regular', 'evonode'] as const).map(node => (
                    <button
                      key={node}
                      type="button"
                      role="radio"
                      aria-checked={draft.dashNode === node}
                      className={`node-option ${draft.dashNode === node ? 'selected' : ''}`}
                      onClick={() => chooseNode(node)}
                    >
                      <strong>{DASH_NODE_LABEL[node]}</strong>
                      <small>{dashYield ? `${nice(dashRate(dashYield, node))}% a year` : dashError ? 'Rate unavailable' : 'Loading rate…'} · {node === 'evonode' ? '4,000' : '1,000'} DASH collateral</small>
                    </button>
                  ))}
                </div>
                <div className={`field-help ${dashError ? 'feed-error' : ''}`}>
                  {dashError
                    ? `Couldn’t load the live yield: ${dashError}`
                    : `Live yearly yield from mnowatch.org${dashYield ? `, as of ${timeOf(dashYield.at)}` : ''}.`}
                </div>
              </div>
            )}
            <div className="two-col">
              <div className="field">
                <label htmlFor="tile-rate">{isDash ? 'Live annual rate (%)' : 'Annual rate (%)'}</label>
                <input id="tile-rate" type="number" step="0.01" value={draft.rate ?? ''} disabled={isDash} onChange={e => set({ rate: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="tile-period">Show interest per</label>
                <select id="tile-period" value={draft.period ?? 'year'} onChange={e => set({ period: e.target.value })}>
                  {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            {isDash ? (
              <div className="field">
                <label>Tiles holding your DASH</label>
                <TilePicker tiles={pickable.filter(t => canLinkTo(draft, t, tiles, edges))} selected={draft.selected ?? []} calc={calc} onToggle={id => set({ selected: toggleId(draft.selected ?? [], id) })} />
                <div className="field-help">
                  Reward = the DASH in each tile you pick (an asset counts by its quantity) × the Dash price × the rate. Links in a chain aren’t used.
                  {calc.dashPrice(draft) === undefined ? ' The Dash price hasn’t loaded yet, so the reward is shown in DASH.' : ` Dash price: ${money(calc.dashPrice(draft)!)}.`}
                </div>
              </div>
            ) : interestLinks.linked ? (
              <div className="field-help note">Linked in a chain, so interest is calculated on the tile it's linked to (to its left or above it).</div>
            ) : (
              <div className="field">
                <label>Calculate interest on</label>
                <TilePicker tiles={pickable} selected={draft.selected ?? []} calc={calc} onToggle={id => set({ selected: toggleId(draft.selected ?? [], id) })} />
              </div>
            )}
          </>
        )}

        {draft.kind === 'sum' && calc.sumInputs(draft).linked && (
          <div className="field-help note">
            Linked in a chain, so it adds up the {calc.sumInputs(draft).ids.length} quantit{calc.sumInputs(draft).ids.length === 1 ? 'y' : 'ies'} connected to it, wherever they sit in the chain.
          </div>
        )}

        {((draft.kind === 'sum' && !calc.sumInputs(draft).linked) || draft.kind === 'group' || draft.kind === 'chart') && (
          <div className="field">
            <label>Included tiles</label>
            {/* Tiles already counted another way (linked below the group, or inside an included group) aren't offered. */}
            <TilePicker tiles={pickable.filter(t => canLinkTo(draft, t, tiles, edges))} selected={draft.selected ?? []} calc={calc} onToggle={id => set({ selected: toggleId(draft.selected ?? [], id) })} />
            {draft.kind === 'group' && calc.includedIds(draft).length > (draft.selected ?? []).length && (
              <div className="field-help">Assets linked below the group are included automatically.</div>
            )}
          </div>
        )}

        <div className="field">
          <label>Logo</label>
          <div className="logo-row">
            {logo ? <img className="logo-preview" src={logoSrc(logo)} alt="Current logo" /> : <span className="logo-preview">None</span>}
            <label className="soft-button" htmlFor="tile-logo-file">
              <ImagePlus size={14} /> {draft.logo ? 'Change image' : 'Use custom image'}
            </label>
            <input id="tile-logo-file" className="visually-hidden" type="file" accept="image/*" onChange={e => { chooseLogo(e.target.files?.[0]); e.target.value = ''; }} />
            {draft.logo && (
              <button className="soft-button" onClick={() => set({ logo: undefined })}><X size={14} /> Remove</button>
            )}
          </div>
          <div className={`field-help ${logoError ? 'error' : ''}`}>{logoError ?? 'Shown in place of the tile’s icon. Saved with the workspace.'}</div>
        </div>

        <div className="field">
          <label>Tile color</label>
          <div className="color-row">
            {TILE_COLORS.map(c => (
              <button
                key={c}
                type="button"
                aria-label={`Use color ${c}`}
                aria-pressed={draft.color === c}
                className={`color-dot ${draft.color === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => set({ color: c })}
              />
            ))}
            {/* Any colour: the swatch shows the custom pick once one is chosen. */}
            <label
              className={`color-dot color-custom ${TILE_COLORS.includes(draft.color) ? '' : 'selected'}`}
              title="Pick any colour"
              style={TILE_COLORS.includes(draft.color) ? undefined : { background: draft.color }}
            >
              <span className="visually-hidden">Custom colour</span>
              <input type="color" value={draft.color} onChange={e => set({ color: e.target.value })} />
            </label>
          </div>
        </div>
      </div>
      <div className="modal-actions">
        {onDelete ? <button className="soft-button danger" onClick={onDelete}><Trash2 size={14} /> Delete</button> : <span />}
        <button className="primary-button" onClick={() => onSave({ ...draft, title: draft.title.trim() })}>{mode === 'create' ? 'Create tile' : 'Save changes'}</button>
      </div>
    </Modal>
  );
}

/** Read an image file and scale it to a small square PNG data URL so workspaces stay light in browser storage. */
function shrinkImage(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      const iw = img.naturalWidth || size;
      const ih = img.naturalHeight || size;
      const scale = Math.max(size / iw, size / ih);
      const w = iw * scale;
      const h = ih * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Not an image'));
    };
    img.src = url;
  });
}

/** Add a tile reference to a formula, joining with + when the formula doesn't already end in an operator. */
function insertReference(expression: string, id: string) {
  const trimmed = expression.trimEnd();
  if (!trimmed || /[+\-*/(%]$/.test(trimmed)) return `${trimmed}${trimmed ? ' ' : ''}[[${id}]]`;
  return `${trimmed} + [[${id}]]`;
}
