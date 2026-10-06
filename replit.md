# Number Board — Portfolio Workspace

(Formerly "Ledgerly". Internal storage names — `~/.ledgerly`, `app://ledgerly`, the `ledgerly-workspace` file tag, `tally-*` localStorage keys — keep the old names on purpose so existing saved boards still load.)

A visual investment and budget workspace built from draggable, linked asset and calculation tiles.

## Run & Operate

- Managed workflow `artifacts/portfolio-workspace: web` — run the frontend preview
- `pnpm --filter @workspace/portfolio-workspace run typecheck` — check the frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Frontend build requires the managed workflow's `PORT` and `BASE_PATH` values
- `pnpm --filter @workspace/desktop run appimage` — build the Linux AppImage into `desktop/release/` (~125 MB, gitignored)

## Stack

- React, Vite, TypeScript, pnpm workspaces
- CSS conic-gradient pie charts; Lucide for icons
- Browser local storage for named workspace persistence
- API server (`artifacts/api-server`) proxies Finnhub stock quotes (`GET /api/stocks/quotes?symbols=`), keeping `FINNHUB_API_KEY` server-side; database scaffold unused

## Where things live

- `artifacts/portfolio-workspace/src/App.tsx` — page layout, toolbar, dialog routing, workspace mutations
- `artifacts/portfolio-workspace/src/workspace/` — tile model, calculations/link rules/snapping, local-storage workspaces hook
- `artifacts/portfolio-workspace/src/components/Canvas.tsx` — drag, magnetic snapping, connectors, tile menu
- `artifacts/portfolio-workspace/src/components/TileCard.tsx` — per-kind tile rendering
- `artifacts/portfolio-workspace/src/components/dialogs/` — asset picker, tile options, add-to-group, save/load
- `artifacts/portfolio-workspace/src/index.css` — dark navy theme and canvas styling
- `artifacts/portfolio-workspace/.replit-artifact/artifact.toml` — managed service routing; update only through artifact validation tools

## Architecture decisions

- Crypto prices come straight from the CoinCodex public API (CORS-open, attribution required, non-commercial licence); stock prices from Finnhub through the API server. Both refresh every minute and write `price`/`priceAt` onto asset tiles. Metals and oil (WTI) come from the OilPriceAPI demo endpoint directly from the browser, cached in localStorage for an hour because the demo allows only 25 requests/day per IP. Only the euro remains a labelled sample price.
- Feed failures are shown in the footer status and the asset picker; never fall back to invented prices.
- Named workspaces are saved in this browser, not an account or remote database.
- Workspace persistence and calculations must continue to work without a live pricing provider (tiles keep their last price).

- Desktop (`desktop/`): Electron wrapper for the AppImage. Serves the web build (built with `BASE_PATH=/`, `VITE_DESKTOP=1`) over a private `app://ledgerly` origin so localStorage survives restarts, and runs the API server's stock + Dash routes in-process on loopback. Users enter their own Finnhub key in the app ("Stock price key", desktop-only); it is saved in `~/.ledgerly/settings.json` (all desktop data, including workspaces, lives in `~/.ledgerly`), never baked into the file. The packaged launcher starts Chromium with `--no-sandbox --disable-dev-shm-usage`; Ubuntu 24.04-based distros half-block its sandbox via AppArmor.

## Product

Users can create, edit, drag, link, recolor, and delete assets, quantities, sums, totals, groups, interest tiles, and pie charts. Quantity expressions support arithmetic and tile-value references. Workspaces can be created, saved, loaded, and deleted locally.

## User preferences

- Sum linked into a chain adds every quantity connected to it (side by side or stacked, any position; quantities may sit to its right); an unlinked sum adds the tiles picked for it. Total = asset price × (the asset's own quantity + every quantity in its chain, any position); unlinked it shows $0. A chained sum also includes the asset's own quantity.
- Interest displays the amount for the selected period without automatically changing other values; its result can be referenced by a quantity.
- Highlight compatible links during dragging. Stacked (vertical) links follow the same kind rules as side-by-side links and are drawn with connectors. A chain may contain only one asset.
- Asset tiles show three fields: unit price, quantity (the asset's own quantity, set in its options window, plus the chain's quantities), and value.
- Double-clicking a value (quantity, fixed asset price, interest rate) edits it in place like a spreadsheet cell; Enter or clicking away saves, Escape cancels. Double-clicking elsewhere on a tile opens its options. Live prices and formulas that reference tiles are not inline-editable.
- Dash masternode tiles are set up by hand: they never snap into chains and ignore chain links. Tiles are picked with + (header) or the options window. Reward = Σ picked tiles' DASH (an asset counts by its quantity) × Dash price × rate. The Dash price is the tile's own live CoinCodex quote (`price`), else any Dash asset tile; without one it shows DASH.
- "Other" asset class: a custom asset with a user-entered name and unit price. USD/EUR prices are not labelled "sample" (the footer still notes the euro rate is a sample).
- Double-click options include tile colors plus a custom colour picker (rainbow swatch); tile background is tinted by the chosen color.
- Links are made by dragging a tile near another (magnetic snap). A tile has one parent link; dragging it away detaches it, and tiles linked to its right/below move with it. Totals and interest tiles in a chain take their inputs from the chain.
- Tiles show their title next to the type icon (blank if untitled), no type word.
- Asset, Group, Pie chart, Dash masternode (and unlinked Sum) tiles have a + button that starts linking mode (click tiles to include them; + again, background click or Escape finishes) — no picker window. Dialog pickers use light-blue highlight, not checkboxes.
- No sidebar or top bar; Save/Load buttons sit beside the workspace title; autosave status sits under the canvas.
- Dropping a quantity between two linked tiles inserts it into the chain and shifts the rest right (or down, for stacked links).
- The $ toggle (or a typed $, converted to the toggle) makes a quantity a dollar amount; quantities whose formula references a dollar tile show $ too.
- Dragging on empty board background draws a selection box; the tiles it touches are picked (Shift/Ctrl adds), and dragging any picked tile moves them all (plus tiles linked after each) as one, keeping links among them. No background panning.
- The mouse wheel scrolls the board (not zoom). Toolbar −/+ and Ctrl+wheel scale the tiles; the scale is saved per workspace.
- The workspace fills the whole window (desktop opens maximized; F11 = true full screen).
- "Refresh prices" button and F5 refresh all feeds; the button text turns red ("Refresh failed") when any feed errors. Commodity calls stay cached hourly (demo quota).
- Save dialog has "Save As…" (pick a folder/file via the save picker, JSON file); Load dialog has "Open file…" to import one.
- Right-clicking empty board space opens an "Add a tile here" menu with every add-tile option; the new tile is placed where you clicked.
- Right-clicking a pie chart or quantity starts linking mode (single right-click; for these kinds stacking is in the tile's … menu). Asset and group right-click stacks/expands immediately; they link via their + button. Linked tiles are highlighted, and clicking a tile adds it (or removes it). Quantities add the clicked tile's value to their formula (`+ [[id]]`; assets as `[[id:value]]` = their Value field). Assets add the clicked tiles' values to their quantity (stored in `selected`; only tiles outside their own chain, no assets).
- Pie charts and groups count asset tiles at their Value field (price × quantity), not their unit price.
- Pie charts are 585px wide with a solid 300px pie (no hole); the legend sits close beside it.
- Group tiles list each included tile's value (not percentages) and can be linked into chains like a quantity; the group's total goes into the chain. Asset tiles stacked below a group are members of it automatically, and member assets can be linked to each other beside or below in any chain shape (all join the group); these asset-to-asset links never join chains or change the assets' values. Tiles linked below a tile are pushed down when it grows.
- A tile is never counted twice by a group, asset or chart: linked members/chain tiles and tiles inside an included group aren't offered for picking, and calculations de-duplicate.
- Quantity dialogs have a square $ toggle (`dollar` on the tile) in front of the value box; the $ is never part of the editable formula.
- Values too wide for a tile squeeze horizontally (scaleX transform only, never layout) so the whole number shows.
- The "Other" asset form has an optional Quantity field; price and quantity may be negative.
- Right-clicking a (non-chart) tile with linked tiles stacks (hides) everything to its right/below, with an outline peeking out below-right; right-click again to expand. Stored as `collapsed` on the tile.
- Tiles always link both side by side and stacked (the user removed the direction toggle).
- Tile padding was halved at the user's request (5.5px 6.5px).
- Crypto assets: top 100 by market cap with logos bundled in `public/crypto`. Stocks: top 100 US companies with logos bundled in `public/stocks` (from CoinCodex images). Any tile can use a custom logo image (shrunk to 96px and saved in the workspace).
- Tiles have no bottom text line except groups; asset as-of time and interest rate sit on the top line after the title.
- Interest tiles show the rate beside the dollar amount in a smaller font.
- Interest is in the unit of its basis: on a plain count (no $) it shows a count, not dollars.
- Dash masternode tiles are interest tiles with `dashNode` (regular/evonode); the rate follows the live yearly yield scraped from mnowatch.org/dash-yield by the API server (`GET /api/dash/yield`, 30 min cache; the page has no API or CORS). Double-click to switch node type.
- USD, EUR, metal bar and oil barrel icons are SVGs in `public/icons`.
- Tile pickers have tile-type filter buttons (only types present; masternodes separate) and A–Z / high-to-low value sort toggles. Picker lists are 50% taller than before (450px; Add tiles dialog up to 900px, capped by the window).
- Footer credit line (user-specified text): "Created by: @Ageofdoge DashPay - @evilduck92 X".
- Pie charts are 390px wide; slice colours default to the source tile's colour and can be changed by double-clicking a legend item (`chartColors`).
- No spreadsheet-data importing in the current scope.

## Gotchas

- Local workspace storage is specific to a browser/profile; clearing browser storage removes local saves.
- Do not present sample quotes as fresh live prices or pretend refreshes contact a provider.
- Finnhub symbols use dots (BRK.B); its free tier allows 60 quote calls/min, so the server caches quotes for 60s.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Original delivery and asset-universe requirements: `.agents/memory/product-requirements.md`
