import type { XeroProvider } from "./provider";
import { MockXeroProvider } from "./mock";

// Active provider, switched via XERO_MODE=mock|live.
// LiveXeroProvider lands in Stage 5 — until then, requesting live fails loudly
// rather than silently demoing mock data as real.

const mode = process.env.XERO_MODE ?? "mock";

function createProvider(): XeroProvider {
  if (mode === "live") {
    throw new Error("XERO_MODE=live but LiveXeroProvider is not implemented yet (Stage 5).");
  }
  return new MockXeroProvider();
}

export const xero: XeroProvider = createProvider();
export type { XeroProvider } from "./provider";
export * from "./types";
