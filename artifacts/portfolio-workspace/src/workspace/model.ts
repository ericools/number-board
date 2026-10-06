import { CRYPTO_CATALOG } from './cryptoCatalog';
import { STOCK_CATALOG } from './stockCatalog';

export type Kind = 'asset' | 'quantity' | 'sum' | 'total' | 'group' | 'interest' | 'chart';
export type Axis = 'h' | 'v';

export type Tile = {
  id: string;
  kind: Kind;
  title: string;
  x: number;
  y: number;
  color: string;
  symbol?: string;
  price?: number;
  /** Assets: units held on the asset tile itself, added to the quantities in its chain. Masternodes use `price` for the live Dash price. */
  quantity?: number;
  currency?: string;
  expression?: string;
  selected?: string[];
  assetId?: string;
  quantityIds?: string[];
  rate?: number;
  period?: string;
  /** Custom logo: a data URL, or a path relative to the app base (e.g. bundled crypto logos). */
  logo?: string;
  /** Asset category from the catalog (Crypto, Equities, …); decides where live prices come from. */
  assetType?: string;
  /** When the asset's live price was last updated (ISO time). */
  priceAt?: string;
  /** Dash masternode interest tiles: which node type's live yield sets `rate`. */
  dashNode?: DashNode;
  /** When a live interest rate was last published (ISO time). */
  rateAt?: string;
  /** Pie charts: custom slice colour per included tile id. */
  chartColors?: Record<string, string>;
  /** Right-click stack: the tiles linked to this one's right and below are hidden behind it. */
  collapsed?: boolean;
  /** Quantities: show the value as a dollar amount (the $ toggle; not part of the formula). */
  dollar?: boolean;
};

export type DashNode = 'regular' | 'evonode';
export const DASH_NODE_LABEL: Record<DashNode, string> = { regular: 'Regular masternode', evonode: 'Evolution masternode (Evonode)' };
export const DASH_COLOR = '#008de4';

export type Edge = { from: string; to: string; axis: Axis };
export type Workspace = { id: string; name: string; tiles: Tile[]; edges: Edge[]; savedAt: string; zoom?: number };
export type Size = { w: number; h: number };

export const TILE_COLORS = [
  '#527df0', '#2f9bd6', '#27a991', '#5fb760', '#d89538',
  '#d66a70', '#c45fae', '#8e6bd7', '#71859f', '#1f3f73',
];

export const DEFAULT_KIND_COLOR: Record<Kind, string> = {
  asset: '#527df0',
  quantity: '#2f9bd6',
  sum: '#27a991',
  total: '#527df0',
  group: '#8e6bd7',
  interest: '#d89538',
  chart: '#2f9bd6',
};

export const KIND_LABEL: Record<Kind, string> = {
  asset: 'Asset',
  quantity: 'Quantity',
  sum: 'Sum',
  total: 'Total',
  group: 'Group',
  interest: 'Interest',
  chart: 'Pie chart',
};

export const PERIODS = [
  { value: 'day', label: 'Day', years: 1 / 365 },
  { value: 'week', label: 'Week', years: 7 / 365 },
  { value: 'month', label: 'Month', years: 1 / 12 },
  { value: 'quarter', label: 'Quarter', years: 1 / 4 },
  { value: 'year', label: 'Year', years: 1 },
];
export const periodYears = (period?: string) => PERIODS.find(p => p.value === period)?.years ?? 1;

export const ASSET_CATEGORIES = ['All', 'Currency', 'Crypto', 'Metals', 'Commodities', 'Equities', 'Other'];
export type CatalogAsset = { symbol: string; name: string; type: string; price?: number; color: string; logo?: string };
const OTHER_ASSETS: CatalogAsset[] = [
  { symbol: 'USD', name: 'US Dollar', type: 'Currency', price: 1, color: '#27a991', logo: 'icons/usd.svg' },
  { symbol: 'EUR', name: 'Euro', type: 'Currency', price: 1.08, color: '#527df0', logo: 'icons/eur.svg' },
  { symbol: 'Gold', name: 'Gold · per oz', type: 'Metals', color: '#d89538', logo: 'icons/gold.svg' },
  { symbol: 'Silver', name: 'Silver · per oz', type: 'Metals', color: '#71859f', logo: 'icons/silver.svg' },
  { symbol: 'Platinum', name: 'Platinum · per oz', type: 'Metals', color: '#71859f', logo: 'icons/platinum.svg' },
  { symbol: 'Palladium', name: 'Palladium · per oz', type: 'Metals', color: '#71859f', logo: 'icons/palladium.svg' },
  { symbol: 'Oil', name: 'Crude oil (WTI) · barrel', type: 'Commodities', color: '#1f3f73', logo: 'icons/oil.svg' },
];
export const ASSET_CATALOG: CatalogAsset[] = [
  ...OTHER_ASSETS.filter(a => a.type === 'Currency'),
  ...CRYPTO_CATALOG.map(c => ({ symbol: c.symbol, name: c.name, type: 'Crypto', color: '#527df0', logo: c.logo })),
  ...OTHER_ASSETS.filter(a => a.type !== 'Currency'),
  ...STOCK_CATALOG.map(st => ({ symbol: st.symbol, name: st.name, type: 'Equities', color: '#2f9bd6', logo: st.logo })),
];

const CRYPTO_LOGO = new Map(CRYPTO_CATALOG.map(c => [c.symbol, c.logo]));
const STOCK_LOGO = new Map(STOCK_CATALOG.map(st => [st.symbol, st.logo]));
const OTHER_TYPE = new Map(OTHER_ASSETS.map(a => [a.symbol.toUpperCase(), a.type]));
const OTHER_LOGO = new Map(OTHER_ASSETS.map(a => [a.symbol.toUpperCase(), a.logo]));

/** Catalog category of an asset tile. Older saves have no assetType, so fall back to the symbol. */
export const assetTypeOf = (tile: Tile) => {
  if (tile.assetType) return tile.assetType;
  const sym = tile.symbol?.toUpperCase() ?? '';
  if (CRYPTO_LOGO.has(sym)) return 'Crypto';
  if (STOCK_LOGO.has(sym)) return 'Equities';
  return OTHER_TYPE.get(sym) ?? 'Other';
};
/** Crypto, stocks, metals and oil are live; currencies and "Other" assets use a fixed price. */
export const isLiveType = (type: string) => type === 'Crypto' || type === 'Equities' || type === 'Metals' || type === 'Commodities';

/** The logo a tile shows: its custom image, or the bundled logo for a known asset (or Dash for masternode tiles). */
export const logoOf = (tile: Tile) => {
  if (tile.logo) return tile.logo;
  if (tile.kind === 'interest' && tile.dashNode) return CRYPTO_LOGO.get('DASH');
  if (tile.kind !== 'asset' || !tile.symbol) return undefined;
  const sym = tile.symbol.toUpperCase();
  const type = assetTypeOf(tile);
  if (type === 'Equities') return STOCK_LOGO.get(sym);
  if (OTHER_TYPE.get(sym) === type) return OTHER_LOGO.get(sym);
  return CRYPTO_LOGO.get(sym) ?? STOCK_LOGO.get(sym);
};
export const logoSrc = (logo: string) => (/^(data:|https?:)/.test(logo) ? logo : `${import.meta.env.BASE_URL}${logo}`);

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 1.6;

export const TILE_WIDTH = 220;
export const CHART_WIDTH = 585;
export const H_GAP = 28;
export const V_GAP = 18;

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
export const money = (n: number) => moneyFormat.format(Number.isFinite(n) ? n : 0);
export const nice = (n: number) => numberFormat.format(Number.isFinite(n) ? n : 0);
export const percent = (n: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number.isFinite(n) ? n : 0)}%`;

/** Name used in lists and pickers. Tiles themselves show a blank title when none was set. */
export const tileName = (tile: Tile) =>
  tile.title.trim() || (tile.kind === 'asset' ? tile.symbol ?? 'Asset' : `Untitled ${KIND_LABEL[tile.kind].toLowerCase()}`);

export function defaultWorkspace(): Workspace {
  const row = (i: number) => 40 + i * 150;
  const col = (i: number) => 40 + i * (TILE_WIDTH + H_GAP);
  const tiles: Tile[] = [
    { id: 'btc', kind: 'asset', title: 'Bitcoin', symbol: 'BTC', price: 67420, color: '#d89538', x: col(0), y: row(0) },
    { id: 'btcqty', kind: 'quantity', title: 'Cold wallet', expression: '0.42', color: '#2f9bd6', x: col(1), y: row(0) },
    { id: 'btctotal', kind: 'total', title: 'Bitcoin position', color: '#527df0', x: col(2), y: row(0) },
    { id: 'cash', kind: 'asset', title: 'US Dollar', symbol: 'USD', price: 1, color: '#27a991', x: col(0), y: row(1) },
    { id: 'cashqty', kind: 'quantity', title: 'Savings account', expression: '18450', color: '#2f9bd6', x: col(1), y: row(1) },
    { id: 'cashtotal', kind: 'total', title: 'Cash position', color: '#527df0', x: col(2), y: row(1) },
    { id: 'interest', kind: 'interest', title: 'Savings yield', rate: 4.25, period: 'year', color: '#d89538', x: col(3), y: row(1) },
    { id: 'eth', kind: 'asset', title: 'Ethereum', symbol: 'ETH', price: 3518.4, color: '#8e6bd7', x: col(0), y: row(2) },
    { id: 'ethqty', kind: 'quantity', title: 'Staking wallet', expression: '3.8', color: '#2f9bd6', x: col(1), y: row(2) },
    { id: 'ethtotal', kind: 'total', title: 'Ethereum position', color: '#527df0', x: col(2), y: row(2) },
    { id: 'crypto', kind: 'sum', title: 'Crypto total', selected: ['btctotal', 'ethtotal'], color: '#27a991', x: col(3), y: row(2) },
    { id: 'portfolio', kind: 'group', title: 'Portfolio mix', selected: ['btctotal', 'cashtotal', 'ethtotal'], color: '#8e6bd7', x: col(0), y: row(3) + 10 },
    { id: 'chart', kind: 'chart', title: 'Allocation', selected: ['btctotal', 'cashtotal', 'ethtotal'], color: '#2f9bd6', x: col(1), y: row(3) + 10 },
  ];
  const chain = (...ids: string[]) => ids.slice(1).map((to, i) => ({ from: ids[i], to, axis: 'h' as const }));
  return {
    id: 'ws-starter',
    name: 'My portfolio',
    tiles,
    edges: [
      ...chain('btc', 'btcqty', 'btctotal'),
      ...chain('cash', 'cashqty', 'cashtotal', 'interest'),
      ...chain('eth', 'ethqty', 'ethtotal'),
    ],
    savedAt: new Date().toISOString(),
  };
}
