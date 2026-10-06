---
name: Price feeds
description: Quirks of the CoinCodex and Finnhub APIs used for live prices.
---
- CoinCodex's old endpoints (`/api/coincodex/get_coin/...`, `/apps/coincodex/cache/all_coins.json`) are dead (500/503). Use `/api/v1/assets/get_asset_list` — it sends `Access-Control-Allow-Origin: *`, so the browser can call it directly with a plain GET.
- Without `type=crypto`, `select_bysymbol` also matches stocks/forex; several coins can share a ticker, so keep the highest market cap.
- CoinCodex stock entries have `symbol` like `SEC:47144`; the ticker is `display_symbol`. Logos: `https://imagecodex.com/v1/coincodex/media/<image_id>/coin64` (64px webp).
- There is no Finnhub Replit integration; the key is the `FINNHUB_API_KEY` secret, used only by the API server.

**Why:** found while wiring live prices; the old endpoints wasted time.
**How to apply:** any change to price fetching or the bundled logo catalogs.

OilPriceAPI demo (`/v1/demo/prices`, no key, CORS `*`): 25 requests/day and 30/hour per IP. `?by_code=GOLD_USD,...` (max 20 codes) works, and includes PLATINUM/PALLADIUM even though the default list doesn't. Never poll it per minute; one combined request per hour, shared across reloads.

mnowatch.org/dash-yield: no API and no CORS header, so it's scraped server-side. Rates sit in the "YEARLY / MONTHLY EARNINGS" box after `id="MN-number"` / `id="Evo-number"`, split as `7.<span class="decimals">38</span> %`. If the layout changes the endpoint returns 502 with a clear message rather than guessing.
