import { resolve } from "node:path";
import { homedir } from "node:os";
import { realpathSync } from "node:fs";
import { readReceipt } from "./install/transaction.ts";
import {
  dataRoot,
  discoverCandidates,
  diagnose,
  readManifest,
  selectInstallation,
  assertDiscordClosed,
  installRelease,
  uninstallRelease,
  installationStatus,
} from "./install/release.ts";
try {
  const command = process.argv[2] ?? "install";
  if (
    !["install", "uninstall", "status", "diagnose", "check"].includes(
      command,
    ) ||
    process.argv.length > 3
  )
    throw new Error("Usage: setup install|uninstall|status|diagnose|check");
  const root = dataRoot();
  const assertClosed = () => assertDiscordClosed(process.platform);
  if (command === "uninstall")
    console.log(uninstallRelease(root, assertClosed));
  else if (command === "status") console.log(installationStatus(root));
  else {
    const candidates = discoverCandidates(
      process.platform,
      homedir(),
      process.env.LOCALAPPDATA,
    );
    if (command === "diagnose")
      console.log(
        JSON.stringify(diagnose(candidates, process.platform), null, 2),
      );
    else if (command === "check") {
      readManifest(__dirname);
      selectInstallation(
        candidates,
        process.platform,
        readReceipt(resolve(root, "state/install.json")),
      );
      console.log(
        "Discord loader found. No files changed. Voice compatibility is determined when Discord runs.",
      );
    } else {
      const runtime = realpathSync(process.execPath);
      console.log(
        installRelease({
          root,
          packageDir: realpathSync(__dirname),
          candidates,
          platform: process.platform,
          runtime,
          runtimeLicense: resolve(
            runtime,
            process.platform === "win32" ? "../LICENSE" : "../../LICENSE",
          ),
          assertClosed,
        }),
      );
    }
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Installation failed.",
  );
  process.exitCode = 1;
}
