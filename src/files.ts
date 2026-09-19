import { randomUUID } from "node:crypto";
import {
  lstatSync,
  writeFileSync,
  renameSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

export function assertPlainPath(path: string): void {
  for (let current = resolve(path); ; current = dirname(current)) {
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error("Refusing a symbolic-link path.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (dirname(current) === current) return;
  }
}

export function atomicWrite(
  path: string,
  content: string | Buffer,
  mode = 0o600,
): void {
  assertPlainPath(path);
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, content, { flag: "wx", mode });
  try {
    chmodSync(temporary, mode);
    assertPlainPath(path);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}
