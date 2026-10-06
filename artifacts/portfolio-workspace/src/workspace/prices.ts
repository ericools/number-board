/**
 * Live market prices: crypto straight from CoinCodex, stocks from Finnhub via our API server (which holds the key),
 * metals and oil from the OilPriceAPI demo endpoint.
 */
export type Quote = { price: number; at: string };
export type QuoteResult = { quotes: Record<string, Quote>; errors: Record<string, string> };

const COINCODEX_LIST = 'https://coincodex.com/api/v1/assets/get_asset_list';

export async function fetchCryptoQuotes(symbols: string[]): Promise<QuoteResult> {
  const wanted = [...new Set(symbols.map(s => s.toUpperCase()))];
  if (wanted.length === 0) return { quotes: {}, errors: {} };
  const params = new URLSearchParams({ type: 'crypto', limit: String(Math.max(wanted.length * 2, 10)), select_bysymbol: wanted.join(',') });
  const res = await fetch(`${COINCODEX_LIST}?${params}`);
  if (!res.ok) throw new Error(`CoinCodex returned ${res.status}`);
  const body = (await res.json()) as { data?: { symbol: string; display_symbol?: string; last_price_usd?: number; last_update?: string; last_market_cap_usd?: number }[] };
  const quotes: Record<string, Quote> = {};
  const cap: Record<string, number> = {};
  // Several coins can share a ticker; keep the one with the largest market cap.
  for (const coin of body.data ?? []) {
    const sym = (coin.display_symbol || coin.symbol).toUpperCase();
    if (!wanted.includes(sym) || !coin.last_price_usd) continue;
    if (quotes[sym] && (cap[sym] ?? 0) >= (coin.last_market_cap_usd ?? 0)) continue;
    quotes[sym] = { price: coin.last_price_usd, at: coin.last_update ?? new Date().toISOString() };
    cap[sym] = coin.last_market_cap_usd ?? 0;
  }
  const errors: Record<string, string> = {};
  for (const sym of wanted) if (!quotes[sym]) errors[sym] = 'Not found on CoinCodex';
  return { quotes, errors };
}

export async function fetchStockQuotes(symbols: string[]): Promise<QuoteResult> {
  const wanted = [...new Set(symbols.map(s => s.toUpperCase()))];
  if (wanted.length === 0) return { quotes: {}, errors: {} };
  const res = await fetch(`${import.meta.env.BASE_URL}api/stocks/quotes?symbols=${encodeURIComponent(wanted.join(','))}`);
  const body = (await res.json().catch(() => ({}))) as Partial<QuoteResult> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Stock price service returned ${res.status}`);
  return { quotes: body.quotes ?? {}, errors: body.errors ?? {} };
}

/** Asset symbol → OilPriceAPI commodity code. */
const COMMODITY_CODES: Record<string, string> = {
  GOLD: 'GOLD_USD',
  SILVER: 'SILVER_USD',
  PLATINUM: 'PLATINUM_USD',
  PALLADIUM: 'PALLADIUM_USD',
  OIL: 'WTI_USD',
};
const OIL_API = 'https://api.oilpriceapi.com/v1/demo/prices';
const COMMODITY_CACHE_KEY = 'ledgerly-commodities-v1';
/** The demo endpoint allows 25 requests per day per IP, so fetch at most hourly and share the result across reloads. */
const COMMODITY_TTL_MS = 60 * 60 * 1000;
type CommodityCache = { fetchedAt: number; quotes: Record<string, Quote> };

export const readCommodityCache = (): CommodityCache | null => {
  try {
    const raw = localStorage.getItem(COMMODITY_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CommodityCache) : null;
  } catch {
    return null;
  }
};

let commodityRequest: Promise<Record<string, Quote>> | null = null;

/** All metal and oil quotes in one request, cached for an hour; concurrent callers share one request. */
async function loadCommodities(): Promise<Record<string, Quote>> {
  const cached = readCommodityCache();
  if (cached && Date.now() - cached.fetchedAt < COMMODITY_TTL_MS) return cached.quotes;
  commodityRequest ??= (async () => {
    try {
      const res = await fetch(`${OIL_API}?by_code=${Object.values(COMMODITY_CODES).join(',')}`);
      if (res.status === 429) throw new Error('OilPriceAPI demo limit reached (25 requests a day); prices will retry later');
      if (!res.ok) throw new Error(`OilPriceAPI returned ${res.status}`);
      const body = (await res.json()) as { data?: { prices?: { code: string; price: number; updated_at: string }[] } };
      const byCode = new Map((body.data?.prices ?? []).map(p => [p.code, p]));
      const quotes: Record<string, Quote> = {};
      for (const [sym, code] of Object.entries(COMMODITY_CODES)) {
        const p = byCode.get(code);
        if (p && Number.isFinite(p.price)) quotes[sym] = { price: p.price, at: p.updated_at };
      }
      try {
        localStorage.setItem(COMMODITY_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), quotes } satisfies CommodityCache));
      } catch {
        // Storage full or blocked: prices still apply for this session.
      }
      return quotes;
    } finally {
      commodityRequest = null;
    }
  })();
  return commodityRequest;
}

export async function fetchCommodityQuotes(symbols: string[]): Promise<QuoteResult> {
  const wanted = [...new Set(symbols.map(s => s.toUpperCase()))];
  if (wanted.length === 0) return { quotes: {}, errors: {} };
  const all = await loadCommodities();
  const quotes: Record<string, Quote> = {};
  const errors: Record<string, string> = {};
  for (const sym of wanted) {
    if (all[sym]) quotes[sym] = all[sym];
    else errors[sym] = COMMODITY_CODES[sym] ? 'Not returned by OilPriceAPI' : 'No OilPriceAPI code for this asset';
  }
  return { quotes, errors };
}

export type DashYield = { masternode: number; evonode: number; at: string };
let lastDashYield: DashYield | null = null;
/** The most recent Dash yields fetched this session, if any. */
export const cachedDashYield = () => lastDashYield;

/** Dash masternode / Evonode yearly yield (%), scraped from mnowatch.org by our API server (the page has no CORS). */
export async function fetchDashYield(): Promise<DashYield> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/dash/yield`);
  const body = (await res.json().catch(() => ({}))) as Partial<DashYield> & { error?: string };
  if (!res.ok || typeof body.masternode !== 'number' || typeof body.evonode !== 'number') {
    throw new Error(body.error ?? `Dash yield service returned ${res.status}`);
  }
  lastDashYield = { masternode: body.masternode, evonode: body.evonode, at: body.at ?? new Date().toISOString() };
  return lastDashYield;
}
export const dashRate = (y: DashYield, node: 'regular' | 'evonode') => (node === 'evonode' ? y.evonode : y.masternode);

/** Which service prices an asset type, and how often. */
export const FEED_INFO: Record<string, { name: string; every: string }> = {
  Crypto: { name: 'CoinCodex', every: 'every minute' },
  Equities: { name: 'Finnhub', every: 'every minute' },
  Metals: { name: 'OilPriceAPI', every: 'hourly' },
  Commodities: { name: 'OilPriceAPI', every: 'hourly' },
};

/** Clock time for today's quotes; adds the date for older ones (e.g. a stock's Friday close over the weekend). */
export const timeOf = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
};
