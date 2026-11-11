import { PORT_RANGE } from "./constants";
import { assertIntInRange, CoreInputError } from "./validate";

export type PortRange = { min: number; max: number };

/** FNV-1a, 32 bits: small, stable across runtimes, good enough to spread names over a range. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * A loopback port for `key` (the container name), free of `used`. Deterministic: the same key
 * and the same used set always give the same port. It starts at the key's hash inside the range
 * and probes upward (wrapping) to the first free one, so the new container of a switch never
 * lands on the old one's port, which is in `used`.
 *
 * `used` must hold every port bound on the host's loopback (kit-deploy's containers and anything
 * else listening there): kit-agent reads both before calling this.
 */
export function allocatePort(
  key: string,
  used: Iterable<number>,
  range: PortRange = PORT_RANGE,
): number {
  if (key.length === 0) throw new CoreInputError("port key must not be empty");
  assertIntInRange("range.min", range.min, 1024, 65535);
  assertIntInRange("range.max", range.max, range.min, 65535);

  const taken = new Set(used);
  const size = range.max - range.min + 1;
  const start = fnv1a(key) % size;
  for (let i = 0; i < size; i++) {
    const port = range.min + ((start + i) % size);
    if (!taken.has(port)) return port;
  }
  throw new CoreInputError(`no free port in ${range.min}–${range.max}`);
}
