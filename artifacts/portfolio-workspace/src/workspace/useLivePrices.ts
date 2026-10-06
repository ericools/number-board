import { useEffect, useMemo, useState } from 'react';
import type { Tile, Workspace } from './model';
import { assetTypeOf } from './model';
import { dashRate, fetchCommodityQuotes, fetchCryptoQuotes, fetchDashYield, fetchStockQuotes, readCommodityCache } from './prices';
import type { QuoteResult } from './prices';

const REFRESH_MS = 60_000;

export type FeedStatus = { state: 'idle' | 'loading' | 'ok' | 'error'; message?: string; at?: string };
export type LiveStatus = { crypto: FeedStatus; stocks: FeedStatus; commodities: FeedStatus; dash: FeedStatus };
export type LivePrices = LiveStatus & { busy: boolean };

/** Keeps crypto, stock, metal and oil asset tiles priced from the live feeds, checking every minute. */
export function useLivePrices(tiles: Tile[], update: (fn: (w: Workspace) => Workspace) => void, refreshToken = 0): LivePrices {
  const [status, setStatus] = useState<LiveStatus>({ crypto: { state: 'idle' }, stocks: { state: 'idle' }, commodities: { state: 'idle' }, dash: { state: 'idle' } });
  const [busy, setBusy] = useState(false);
  const key = useMemo(() => {
    const pick = (...types: string[]) =>
      [...new Set(tiles.filter(t => t.kind === 'asset' && t.symbol && types.includes(assetTypeOf(t))).map(t => t.symbol!.toUpperCase()))].sort();
    const dash = tiles.some(t => t.kind === 'interest' && t.dashNode) ? 'dash' : '';
    // Masternodes keep their own live Dash price, so DASH is fetched whenever one exists.
    const crypto = [...new Set([...pick('Crypto'), ...(dash ? ['DASH'] : [])])].sort().join(',');
    return `${crypto}|${pick('Equities').join(',')}|${pick('Metals', 'Commodities').join(',')}|${dash}`;
  }, [tiles]);

  useEffect(() => {
    const [crypto, stocks, commodities, dash] = key.split('|').map(k => (k ? k.split(',') : []));
    let cancelled = false;

    const apply = (types: string[], result: QuoteResult) =>
      update(w => {
        let changed = false;
        const next = w.tiles.map(t => {
          const q =
            t.kind === 'asset' && t.symbol && types.includes(assetTypeOf(t))
              ? result.quotes[t.symbol.toUpperCase()]
              : t.kind === 'interest' && t.dashNode && types.includes('Crypto')
                ? result.quotes.DASH
                : undefined;
          if (!q || (q.price === t.price && q.at === t.priceAt)) return t;
          changed = true;
          return { ...t, price: q.price, priceAt: q.at };
        });
        return changed ? { ...w, tiles: next } : w;
      });

    const run = async (feed: keyof LiveStatus, types: string[], symbols: string[], fetcher: (s: string[]) => Promise<QuoteResult>) => {
      if (symbols.length === 0) return setStatus(s => ({ ...s, [feed]: { state: 'idle' } }));
      setStatus(s => ({ ...s, [feed]: { ...s[feed], state: s[feed].state === 'ok' ? 'ok' : 'loading' } }));
      try {
        const result = await fetcher(symbols);
        if (cancelled) return;
        apply(types, result);
        const missing = Object.entries(result.errors);
        setStatus(s => ({
          ...s,
          [feed]: {
            state: missing.length === symbols.length ? 'error' : 'ok',
            message: missing.length ? missing.map(([sym, msg]) => `${sym}: ${msg}`).join('; ') : undefined,
            // Commodity quotes may come from the hourly cache, so report when they were actually fetched.
            at: new Date(feed === 'commodities' ? readCommodityCache()?.fetchedAt ?? Date.now() : Date.now()).toISOString(),
          },
        }));
      } catch (err) {
        if (!cancelled) setStatus(s => ({ ...s, [feed]: { ...s[feed], state: 'error', message: err instanceof Error ? err.message : 'Request failed' } }));
      }
    };

    // Dash masternode tiles: the yield is a rate, not a price, so it is applied to `rate`/`rateAt`.
    const runDash = async () => {
      if (dash.length === 0) return setStatus(s => ({ ...s, dash: { state: 'idle' } }));
      setStatus(s => ({ ...s, dash: { ...s.dash, state: s.dash.state === 'ok' ? 'ok' : 'loading' } }));
      try {
        const y = await fetchDashYield();
        if (cancelled) return;
        update(w => {
          let changed = false;
          const next = w.tiles.map(t => {
            if (t.kind !== 'interest' || !t.dashNode) return t;
            const rate = dashRate(y, t.dashNode);
            if (rate === t.rate && y.at === t.rateAt) return t;
            changed = true;
            return { ...t, rate, rateAt: y.at };
          });
          return changed ? { ...w, tiles: next } : w;
        });
        setStatus(s => ({ ...s, dash: { state: 'ok', at: y.at } }));
      } catch (err) {
        if (!cancelled) setStatus(s => ({ ...s, dash: { ...s.dash, state: 'error', message: err instanceof Error ? err.message : 'Request failed' } }));
      }
    };

    const refresh = () => {
      setBusy(true);
      void Promise.all([
        runDash(),
        run('crypto', ['Crypto'], crypto, fetchCryptoQuotes),
        run('stocks', ['Equities'], stocks, fetchStockQuotes),
        // Hits the network at most hourly (the free demo allows 25 calls a day); other ticks use the cache.
        run('commodities', ['Metals', 'Commodities'], commodities, fetchCommodityQuotes),
      ]).finally(() => !cancelled && setBusy(false));
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [key, update, refreshToken]);

  return { ...status, busy };
}
