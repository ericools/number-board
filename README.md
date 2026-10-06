# Number Board

A board of linked, draggable tiles for tracking investments and budgets. Asset tiles pull live prices (crypto, stocks, metals, oil); quantity, sum, total, interest, group and pie-chart tiles link to them so values flow through each chain.

It runs as a web app (`artifacts/portfolio-workspace`, with its API in `artifacts/api-server`) and as a Linux AppImage (`desktop/`, built with Electron).

## Run it

```sh
pnpm install
pnpm --filter @workspace/api-server run dev        # API (stock and Dash price routes)
pnpm --filter @workspace/portfolio-workspace run dev  # web app
```

Stock prices need a Finnhub API key: on the web it is read from the `FINNHUB_API_KEY` environment variable on the server; in the desktop app you enter your own key in the app.

## Build the AppImage

```sh
pnpm --filter @workspace/desktop run appimage
```

The file is written to `desktop/release/`.
