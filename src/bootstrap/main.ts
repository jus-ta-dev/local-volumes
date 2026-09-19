import { app, BrowserWindow } from "electron";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { readConfig, writeConfig } from "../core/storage.ts";
import { emptyConfig } from "../core/config.ts";
import { assertPlainPath, atomicWrite } from "../files.ts";

const globalState = globalThis as any;
if (!globalState.__LOCAL_VOLUMES_BOOTSTRAP__) {
  globalState.__LOCAL_VOLUMES_BOOTSTRAP__ = true;
  const stateDir =
    typeof globalState.__LOCAL_VOLUMES_STATE_DIR__ === "string"
      ? resolve(globalState.__LOCAL_VOLUMES_STATE_DIR__)
      : resolve(__dirname, "../.local-volumes");
  const configPath = resolve(stateDir, "groups.json");
  const attached = new WeakSet<object>();
  function report(state: string, s?: any) {
    try {
      assertPlainPath(stateDir);
      mkdirSync(stateDir, { recursive: true, mode: 0o700 });
      const result = {
        at: new Date().toISOString(),
        pid: process.pid,
        host: app.getVersion(),
        electron: process.versions.electron,
        state,
        renderer: s
          ? {
              version: s.version === 3 ? 3 : s.version === 2 ? 2 : 1,
              disposed: s.disposed === true,
              state:
                typeof s.state === "string" ? s.state.slice(0, 40) : "unknown",
              participantCount: Number.isInteger(s.participantCount)
                ? s.participantCount
                : 0,
              groupCount: Number.isInteger(s.groupCount) ? s.groupCount : 0,
              capabilitiesResolved: s.capabilitiesResolved === true,
              message:
                typeof s.message === "string" ? s.message.slice(0, 300) : "",
            }
          : undefined,
      };
      atomicWrite(
        resolve(stateDir, "runtime.json"),
        JSON.stringify(result, null, 2) + "\n",
      );
    } catch {
      /* Diagnostics must never break Discord. */
    }
  }
  function allowed(win: any): boolean {
    if (win.isDestroyed() || win.id !== globalState.mainWindowId) return false;
    try {
      const url = new URL(win.webContents.getURL());
      return (
        ["https://discord.com", "https://discordapp.com"].includes(
          url.origin,
        ) &&
        (url.pathname === "/app" ||
          url.pathname.startsWith("/channels/") ||
          url.pathname === "/login")
      );
    } catch {
      return false;
    }
  }
  function attach(win: any) {
    if (attached.has(win)) return;
    attached.add(win);
    let polling: ReturnType<typeof setInterval> | undefined;
    let running = false,
      failures = 0,
      storageBlocked = false;
    function stop() {
      if (polling) clearInterval(polling);
      polling = undefined;
    }
    async function sample() {
      if (running || !allowed(win)) return;
      running = true;
      try {
        const snapshot = await win.webContents.executeJavaScript(
          "window.__LOCAL_VOLUMES__?.snapshot?.()",
        );
        if (!allowed(win)) return;
        failures = 0;
        report(
          snapshot ? "renderer-loaded" : "renderer-unavailable",
          snapshot?.status,
        );
        if (snapshot?.pending && !storageBlocked) {
          const revision = snapshot.pending.revision;
          if (!Number.isSafeInteger(revision) || revision < 1)
            throw new Error("Invalid configuration revision.");
          let error = "";
          try {
            writeConfig(configPath, snapshot.pending.config);
          } catch {
            error =
              "Could not save settings on this device. Changes are only in memory; retry saving.";
          }
          await win.webContents.executeJavaScript(
            `window.__LOCAL_VOLUMES__?.saved(${revision},${JSON.stringify(error)})`,
          );
        }
      } catch {
        if (++failures >= 3) {
          stop();
          report("renderer-evaluation-failed");
        }
      } finally {
        running = false;
      }
    }
    async function load() {
      stop();
      if (!allowed(win)) return;
      try {
        let config = emptyConfig(),
          storageError = "";
        try {
          config = readConfig(configPath);
        } catch {
          storageError =
            "Saved groups could not be read. Configuration is protected; repair groups.json before continuing.";
        }
        storageBlocked = Boolean(storageError);
        await win.webContents.executeJavaScript(
          `window.__LOCAL_VOLUMES_INITIAL__ = ${JSON.stringify({ config, storageError, storageVersion: 3 })};`,
        );
        if (!allowed(win)) return;
        await win.webContents.executeJavaScript(
          readFileSync(resolve(__dirname, "renderer.js"), "utf8"),
        );
        await sample();
        polling = setInterval(() => {
          void sample();
        }, 1000);
      } catch {
        report("renderer-load-failed");
      }
    }
    win.webContents.on("did-finish-load", () => {
      void load();
    });
    win.webContents.on("render-process-gone", () => {
      stop();
      report("renderer-exited");
    });
    win.on("closed", stop);
    if (!win.webContents.isLoading()) void load();
  }
  report("bootstrap-loaded");
  app.on("browser-window-created", (_event: unknown, win: any) => attach(win));
  app
    .whenReady()
    .then(() => {
      for (const win of BrowserWindow.getAllWindows()) attach(win);
    })
    .catch(() => report("host-not-ready"));
  app.on("will-quit", () => report("host-exited"));
}
