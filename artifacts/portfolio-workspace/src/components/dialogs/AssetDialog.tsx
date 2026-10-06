import { PencilLine, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ASSET_CATALOG, ASSET_CATEGORIES, TILE_COLORS, money } from '../../workspace/model';
import type { CatalogAsset } from '../../workspace/model';
import { fetchCommodityQuotes, fetchCryptoQuotes, fetchStockQuotes, readCommodityCache } from '../../workspace/prices';
import type { Quote } from '../../workspace/prices';
import { AssetSigil, LogoImage } from '../TileCard';
import { Modal } from './Modal';

type Asset = CatalogAsset & { priceAt?: string; quantity?: number };
const CRYPTO_SYMBOLS = ASSET_CATALOG.filter(a => a.type === 'Crypto').map(a => a.symbol);
/** The "Other" choice: a generic asset with a name and unit price the user types in. */
const OTHER = '__other';
const COMMODITY_SYMBOLS = ASSET_CATALOG.filter(a => a.type === 'Metals' || a.type === 'Commodities').map(a => a.symbol);

export function AssetDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (asset: Asset) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [chosen, setChosen] = useState<string | null>(null);
  const results = ASSET_CATALOG.filter(
    a => (category === 'All' || a.type === category) && `${a.symbol} ${a.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  const [live, setLive] = useState<Record<string, Quote>>(() => readCommodityCache()?.quotes ?? {});
  const [feedError, setFeedError] = useState<string | null>(null);
  const [otherName, setOtherName] = useState('');
  const [otherPrice, setOtherPrice] = useState('');
  const [otherQuantity, setOtherQuantity] = useState('');
  const showOther = (category === 'All' || category === 'Other') && 'other custom own'.includes(query.trim().toLowerCase());
  const otherValue = Number(otherPrice.replace(/[$,\s]/g, ''));
  // Quantity is optional (blank = none yet).
  const otherUnits = otherQuantity.trim() ? Number(otherQuantity.replace(/[,\s]/g, '')) : undefined;
  const otherUnitsOk = otherUnits === undefined || Number.isFinite(otherUnits);
  const otherAsset: Asset | null =
    otherName.trim() && otherPrice.trim() && Number.isFinite(otherValue) && otherUnitsOk
      ? { symbol: otherName.trim(), name: otherName.trim(), type: 'Other', price: otherValue, quantity: otherUnits, color: TILE_COLORS[8] }
      : null;
  // Crypto prices for the whole list come in one CoinCodex request; stock quotes are fetched one at a time on selection.
  useEffect(() => {
    fetchCryptoQuotes(CRYPTO_SYMBOLS)
      .then(r => setLive(prev => ({ ...prev, ...r.quotes })))
      .catch(err => setFeedError(`Crypto prices unavailable: ${err.message}`));
    fetchCommodityQuotes(COMMODITY_SYMBOLS)
      .then(r => setLive(prev => ({ ...prev, ...r.quotes })))
      .catch(err => setFeedError(`Metal and oil prices unavailable: ${err.message}`));
  }, []);
  const base = ASSET_CATALOG.find(a => a.symbol === chosen);
  useEffect(() => {
    if (base?.type !== 'Equities' || live[base.symbol]) return;
    fetchStockQuotes([base.symbol])
      .then(r => {
        if (r.quotes[base.symbol]) setLive(prev => ({ ...prev, ...r.quotes }));
        else setFeedError(`${base.symbol}: ${r.errors[base.symbol] ?? 'no quote'}`);
      })
      .catch(err => setFeedError(`Stock prices unavailable: ${err.message}`));
  }, [base, live]);
  const withLive = (a: CatalogAsset): Asset => (live[a.symbol.toUpperCase()] ? { ...a, price: live[a.symbol.toUpperCase()].price, priceAt: live[a.symbol.toUpperCase()].at } : a);
  const priceLabel = (a: CatalogAsset) => {
    const q = live[a.symbol.toUpperCase()];
    if (q) return `Live ${money(q.price)}`;
    if (a.type === 'Equities') return chosen === a.symbol ? 'Loading price…' : 'Live price after selecting';
    if (a.type !== 'Currency') return 'Loading price…';
    return money(a.price ?? 0);
  };
  const asset = chosen === OTHER ? otherAsset : base && withLive(base);
  return (
    <Modal title="Add an asset" subtitle="Choose an asset, then create its tile." onClose={onClose} wide>
      <div className="field search-field">
        <Search size={15} />
        <input autoFocus placeholder="Search assets" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="asset-categories">
        {ASSET_CATEGORIES.map(c => (
          <button key={c} className={`category-pill ${category === c ? 'selected' : ''}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>
      <div className="asset-results">
        {showOther && (
          <button className={`asset-option ${chosen === OTHER ? 'selected' : ''}`} aria-pressed={chosen === OTHER} onClick={() => setChosen(OTHER)}>
            <span className="other-sigil"><PencilLine size={15} /></span>
            <span>
              <strong>Other</strong>
              <small>Your own asset · set the name and unit price</small>
            </span>
          </button>
        )}
        {results.map(a => (
          <button
            key={a.symbol}
            className={`asset-option ${chosen === a.symbol ? 'selected' : ''}`}
            aria-pressed={chosen === a.symbol}
            onClick={() => setChosen(a.symbol)}
            onDoubleClick={() => onCreate(withLive(a))}
          >
            {a.logo ? <LogoImage logo={a.logo} /> : <AssetSigil symbol={a.symbol} color={a.color} />}
            <span>
              <strong>{a.name}</strong>
              <small>{a.symbol} · {priceLabel(a)}</small>
            </span>
          </button>
        ))}
        {results.length === 0 && !showOther && <div className="pick-empty">No assets match that search.</div>}
      </div>
      {chosen === OTHER && (
        <div className="other-fields">
          <div className="field">
            <label htmlFor="other-name">Name</label>
            <input id="other-name" autoFocus value={otherName} placeholder="e.g. Classic car" onChange={e => setOtherName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="other-price">Unit price (USD)</label>
            <input id="other-price" inputMode="decimal" value={otherPrice} placeholder="0.00" onChange={e => setOtherPrice(e.target.value)} onKeyDown={e => e.key === 'Enter' && otherAsset && onCreate(otherAsset)} />
          </div>
          <div className="field">
            <label htmlFor="other-quantity">Quantity</label>
            <input id="other-quantity" inputMode="decimal" value={otherQuantity} placeholder="0" aria-invalid={!otherUnitsOk} onChange={e => setOtherQuantity(e.target.value)} onKeyDown={e => e.key === 'Enter' && otherAsset && onCreate(otherAsset)} />
            {!otherUnitsOk && <span className="field-help feed-error">Enter a number.</span>}
          </div>
        </div>
      )}
      <div className="modal-actions">
        <span className={`field-help ${feedError ? 'feed-error' : ''}`}><ShieldCheck size={12} /> {feedError ?? 'Crypto prices from CoinCodex, stocks from Finnhub, metals and oil from OilPriceAPI. The euro rate is a sample price.'}</span>
        <button className="primary-button" disabled={!asset} onClick={() => asset && onCreate(asset)}>Create tile</button>
      </div>
    </Modal>
  );
}
