import { afterEach, expect, it, vi } from "vitest";
import { randomId } from "@/lib/random-id";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

it("uses randomUUID where the page is secure", () => {
  expect(randomId()).toMatch(uuid);
});

// A phone reaching the dev server by its network address over plain http has
// no randomUUID at all, and the check-in used to crash on opening there.
it("still makes a UUID on an insecure page", () => {
  const real = globalThis.crypto;
  vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => real.getRandomValues(bytes) });
  const made = new Set(Array.from({ length: 200 }, () => randomId()));
  for (const id of made) expect(id).toMatch(uuid);
  expect(made.size).toBe(200);
});
