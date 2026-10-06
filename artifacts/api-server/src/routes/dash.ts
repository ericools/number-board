import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

/**
 * Dash masternode and Evonode yearly yield, read from https://mnowatch.org/dash-yield/.
 * The page has no API and no CORS header, so the server fetches and parses it.
 */
const router: IRouter = Router();

const SOURCE = "https://mnowatch.org/dash-yield/";
const CACHE_MS = 30 * 60_000;
type DashYield = { masternode: number; evonode: number; at: string };
let cache: { data: DashYield; fetched: number } | null = null;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The yearly % shown in one node card, e.g. `≈&nbsp;7.<span class="decimals">38</span> %`. */
function rateIn(segment: string): number {
  const flat = segment.replace(/<span class="decimals">(\d+)<\/span>/g, "$1").replace(/&nbsp;/g, " ");
  const match = flat.match(/class="green">\s*<span class="about">≈<\/span>\s*(\d+(?:\.\d+)?)\s*%/) ?? flat.match(/(\d+(?:\.\d+)?)\s*%/);
  const rate = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) throw new Error("Could not read the yield from mnowatch.org");
  return rate;
}

export function parseDashYield(html: string): DashYield {
  const start = html.indexOf("YEARLY / MONTHLY EARNINGS");
  const box = start >= 0 ? html.slice(start) : html;
  const mn = box.indexOf('id="MN-number"');
  const evo = box.indexOf('id="Evo-number"');
  if (mn < 0 || evo < mn) throw new Error("mnowatch.org page layout changed; yields not found");
  const refreshed = html.match(/Page refreshed on\s*(?:<[^>]+>\s*)*(\d{1,2}) (\w+) (\d{4}), (\d{1,2}):(\d{2})/);
  let at = new Date().toISOString();
  if (refreshed) {
    const month = MONTHS.indexOf(refreshed[2].toLowerCase());
    if (month >= 0) at = new Date(Date.UTC(+refreshed[3], month, +refreshed[1], +refreshed[4], +refreshed[5])).toISOString();
  }
  return { masternode: rateIn(box.slice(mn, evo)), evonode: rateIn(box.slice(evo, evo + 4000)), at };
}

router.get("/dash/yield", async (_req, res) => {
  if (cache && Date.now() - cache.fetched < CACHE_MS) {
    res.json(cache.data);
    return;
  }
  try {
    const page = await fetch(SOURCE, { headers: { "User-Agent": "NumberBoard/1.0 (portfolio app)" } });
    if (!page.ok) throw new Error(`mnowatch.org returned ${page.status}`);
    const data = parseDashYield(await page.text());
    cache = { data, fetched: Date.now() };
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    logger.warn({ err: message }, "Dash yield fetch failed");
    res.status(502).json({ error: message });
  }
});

export default router;
