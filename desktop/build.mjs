// Builds the Number Board Linux AppImage: web app → Electron main bundle → electron-builder.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { build as esbuild } from "esbuild";
import { build as buildApp, Platform } from "electron-builder";

const root = import.meta.dirname;
const out = path.join(root, "app");
const apiServer = path.resolve(root, "../artifacts/api-server");
fs.rmSync(out, { recursive: true, force: true });

console.log("› Building the web app for the desktop…");
execFileSync("pnpm", ["--filter", "@workspace/portfolio-workspace", "exec", "vite", "build", "--config", "vite.config.ts", "--outDir", path.join(out, "web"), "--emptyOutDir", "--sourcemap", "hidden"], {
  stdio: "inherit",
  env: { ...process.env, PORT: "5000", BASE_PATH: "/", VITE_DESKTOP: "1", NODE_ENV: "production" },
});

console.log("› Bundling the Electron main process…");
await esbuild({
  entryPoints: [path.join(root, "src/main.ts")],
  outfile: path.join(out, "main.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  nodePaths: [path.join(apiServer, "node_modules")],
  logLevel: "warning",
  plugins: [{
    name: "desktop-logger",
    setup(b) {
      b.onResolve({ filter: /\/lib\/logger$/ }, () => ({ path: path.join(root, "src/logger.ts") }));
    },
  }],
});
fs.copyFileSync(path.join(root, "build/icon.png"), path.join(out, "icon.png"));

console.log("› Packaging the AppImage…");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
await buildApp({
  targets: Platform.LINUX.createTarget(["AppImage"]),
  config: {
    appId: "app.numberboard.desktop",
    productName: "Number Board",
    executableName: "number-board",
    directories: { output: "release", buildResources: "build" },
    files: ["app/**/*", "package.json"],
    npmRebuild: false,
    // Launcher flags must be on the real command line: Chromium sets up its sandbox and shared memory before
    // main.js runs. Ubuntu 24.04-based distros (e.g. Mint 22) half-block the sandbox via AppArmor, so file
    // calls fail with "No such process"; Number Board only loads its own bundled pages, so it runs without it.
    afterPack: async ({ appOutDir, electronPlatformName, packager }) => {
      if (electronPlatformName !== "linux") return;
      const name = packager.executableName;
      const bin = path.join(appOutDir, name);
      fs.renameSync(bin, `${bin}-bin`);
      fs.writeFileSync(bin, `#!/bin/sh\nHERE="$(dirname "$(readlink -f "$0")")"\nexec "$HERE/${name}-bin" --no-sandbox --disable-dev-shm-usage "$@"\n`, { mode: 0o755 });
    },
    asar: true,
    linux: {
      target: "AppImage",
      category: "Office",
      syncDesktopName: true,
      icon: "build/icon.png",
      synopsis: "Linked-tile investment and budget workspace",
      artifactName: `Number-Board-${pkg.version}-x86_64.AppImage`,
    },
  },
});
console.log(`✓ desktop/release/Number-Board-${pkg.version}-x86_64.AppImage`);
