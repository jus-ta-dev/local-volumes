import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { emptyConfig, validateConfig, type Configuration } from "./config.ts";
import { assertPlainPath, atomicWrite } from "../files.ts";

export function readConfig(path: string): Configuration {
  try {
    assertPlainPath(path);
    const bytes = readFileSync(path);
    if (bytes.length > 1024 * 1024)
      throw new Error("Group configuration is too large.");
    return validateConfig(JSON.parse(bytes.toString("utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptyConfig();
    throw new Error(
      "Could not read saved groups. The original file was left untouched.",
    );
  }
}
export function writeConfig(path: string, config: unknown): void {
  const content = JSON.stringify(validateConfig(config), null, 2) + "\n";
  if (Buffer.byteLength(content) > 1024 * 1024)
    throw new Error("Group configuration is too large.");
  assertPlainPath(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  atomicWrite(path, content);
}
