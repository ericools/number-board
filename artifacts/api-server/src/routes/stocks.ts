import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

/** Live stock quotes from Finnhub. The API key stays on the server. */
const router: IRouter = Router();

type Quote = { price: number; at: string };
const CACHE_MS = 60_000;
const cache = new Map<string, { quote: Quote; fetched: number }>();
const SYMBOL = /^[A-Z][A-Z0-9.\-]{0,9}$/;

async function fetchQuote(symbol: string, key: string): Promise<Quote> {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`, {
    headers: { "X-Finnhub-Token": key },
  });
  if (res.status === 429) throw new Error("Finnhub rate limit reached");
  if (res.status === 401 || res.status === 403) throw new Error("Finnhub rejected the API key");
  if (!res.ok) throw new Error(`Finnhub returned ${res.status}`);
  const body = (await res.json()) as { c?: number; t?: number };
  if (!body.c || !body.t) throw new Error("No quote available for this symbol");
  return { price: body.c, at: new Date(body.t * 1000).toISOString() };
}

router.get("/stocks/quotes", async (req, res) => {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    res.status(503).json({ error: "Finnhub API key is not configured" });
    return;
  }
  const symbols = [...new Set(String(req.query.symbols ?? "").toUpperCase().split(",").map(s => s.trim()).filter(Boolean))];
  if (symbols.length === 0 || symbols.length > 50 || !symbols.every(s => SYMBOL.test(s))) {
    res.status(400).json({ error: "Pass 1–50 comma-separated stock symbols" });
    return;
  }

  const quotes: Record<string, Quote> = {};
  const errors: Record<string, string> = {};
  const now = Date.now();
  const stale = symbols.filter(s => {
    const hit = cache.get(s);
    if (hit && now - hit.fetched < CACHE_MS) quotes[s] = hit.quote;
    return !quotes[s];
  });
  // Finnhub's free tier allows 60 calls a minute; fetch in small batches.
  for (let i = 0; i < stale.length; i += 8) {
    await Promise.all(
      stale.slice(i, i + 8).map(async s => {
        try {
          const quote = await fetchQuote(s, key);
          cache.set(s, { quote, fetched: Date.now() });
          quotes[s] = quote;
        } catch (err) {
          errors[s] = err instanceof Error ? err.message : "Quote request failed";
          logger.warn({ symbol: s, err: errors[s] }, "Finnhub quote failed");
        }
      }),
    );
  }
  res.json({ quotes, errors });
});

export default router;
