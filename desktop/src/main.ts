import { app, BrowserWindow, Menu, net, protocol, shell } from "electron";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import dashRouter from "../../artifacts/api-server/src/routes/dash";
import stocksRouter from "../../artifacts/api-server/src/routes/stocks";

/**
 * Number Board desktop shell. The web app is served from the bundled build over a private `app://ledgerly`
 * origin (stable, so saved workspaces in localStorage survive restarts). `/api/*` goes to the same stock
 * and Dash routes the web version uses, running on a loopback-only server inside this process.
 */

// Ubuntu 23.10+ blocks the unprivileged namespaces Chromium's sandbox needs, which makes AppImages crash on launch.
app.commandLine.appendSwitch("no-sandbox");
// Keep Chromium's shared memory in the temp folder; some systems block or misconfigure /dev/shm.
// The packaged launcher passes this too, because Chromium can use shared memory before this file runs.
app.commandLine.appendSwitch("disable-dev-shm-usage");

// Workspaces, the Finnhub key and browser storage live together in ~/.ledgerly (the folder keeps the app's
// earlier name so boards saved before the rename are still there).
const DATA_DIR = path.join(os.homedir(), ".ledgerly");
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
app.setPath("userData", DATA_DIR);

const ORIGIN = "app://ledgerly";
const WEB_ROOT = path.join(__dirname, "web");
const settingsFile = () => path.join(DATA_DIR, "settings.json");
type Settings = { finnhubKey?: string };

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function readSettings(): Settings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8")) as Settings;
  } catch {
    return {};
  }
}

function applySettings(s: Settings) {
  if (s.finnhubKey) process.env.FINNHUB_API_KEY = s.finnhubKey;
  else delete process.env.FINNHUB_API_KEY;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Handled in-process (never over TCP) so other programs on the machine can't change the key. */
async function handleSettings(req: Request): Promise<Response> {
  if (req.method === "GET") return json({ finnhubKey: Boolean(readSettings().finnhubKey) });
  if (req.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  const body = (await req.json().catch(() => ({}))) as { finnhubKey?: unknown };
  const key = body.finnhubKey;
  if (key !== null && (typeof key !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(key))) {
    return json({ error: "That doesn’t look like a Finnhub API key." }, 400);
  }
  const next: Settings = { ...readSettings(), finnhubKey: key ?? undefined };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), { mode: 0o600 });
  applySettings(next);
  return json({ finnhubKey: Boolean(next.finnhubKey) });
}

function startApiServer(): Promise<number> {
  const api = express();
  api.use("/api", stocksRouter);
  api.use("/api", dashRouter);
  return new Promise((resolve, reject) => {
    const server = api.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
    server.on("error", reject);
  });
}

function serveStatic(pathname: string): Promise<Response> {
  const file = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)));
  if (!file.startsWith(WEB_ROOT)) return Promise.resolve(new Response("Not found", { status: 404 }));
  const exists = fs.existsSync(file) && fs.statSync(file).isFile();
  return net.fetch(pathToFileURL(exists ? file : path.join(WEB_ROOT, "index.html")).toString());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: "Number Board",
    backgroundColor: "#0a1628",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Links (Finnhub sign-up, credits) open in the user's browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  // Open filling the screen; F11 switches to true full screen and back.
  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  // Page errors would otherwise only be visible in DevTools; print them where the app was started.
  win.webContents.on("console-message", e => {
    if (e.level === "error" || e.level === "warning") console.error(`[page ${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  win.webContents.on("render-process-gone", (_e, details) => console.error(`[page crashed] ${details.reason} (exit code ${details.exitCode})`));
  void win.loadURL(`${ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    applySettings(readSettings());
    const port = await startApiServer();
    protocol.handle("app", req => {
      const { pathname, search } = new URL(req.url);
      if (pathname === "/api/settings") return handleSettings(req);
      if (pathname.startsWith("/api/")) return net.fetch(`http://127.0.0.1:${port}${pathname}${search}`);
      return serveStatic(pathname);
    });
    Menu.setApplicationMenu(null);
    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
}
