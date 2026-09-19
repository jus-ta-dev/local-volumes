export interface PlaybackTarget {
  userId: string;
  readBaseline(): number;
  readPlayback(): number;
  writePlayback(raw: number): void;
  isCurrent(): boolean;
}

// Observe only the synchronous native write made by Discord's existing wrapper.
// That wrapper catches exceptions and updates its cache even when native fails.
export function writePlaybackChecked(
  connection: any,
  userId: string,
  raw: number,
): void {
  const native = connection.conn;
  const descriptor =
    native && Object.getOwnPropertyDescriptor(native, "setLocalVolume");
  if (
    !descriptor ||
    typeof descriptor.value !== "function" ||
    !descriptor.writable
  ) {
    throw new Error("Native playback write cannot be checked on this build.");
  }
  let calls = 0;
  let failed = false;
  const original = descriptor.value;
  try {
    Object.defineProperty(native, "setLocalVolume", {
      ...descriptor,
      value: function (id: string, gain: number) {
        calls++;
        if (
          id !== userId ||
          !Number.isFinite(gain) ||
          Math.abs(gain - raw / 100) > 1e-6
        ) {
          failed = true;
          throw new Error("Unexpected native playback arguments.");
        }
        try {
          return original.call(this, id, gain);
        } catch {
          failed = true;
          throw new Error("Native playback write failed.");
        }
      },
    });
    connection.setLocalVolume(userId, raw);
  } finally {
    Object.defineProperty(native, "setLocalVolume", descriptor);
  }
  if (failed || calls !== 1)
    throw new Error("Discord did not complete the native playback write.");
}
