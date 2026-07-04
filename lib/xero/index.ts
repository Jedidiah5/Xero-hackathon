import type { XeroProvider } from "./provider";
import { MockXeroProvider } from "./mock";
import { LiveXeroProvider } from "./live";

// Active provider, switched via XERO_MODE=mock|live.
// Default is MOCK — the demo path. Live is opt-in for testing against the
// Demo org; if it misbehaves, unset XERO_MODE (or set =mock) and restart:
// the mock demo is always the fallback.

const mode = process.env.XERO_MODE ?? "mock";

function createProvider(): XeroProvider {
  if (mode === "live") {
    // Construction is cheap and connectionless; the MCP connection happens
    // lazily on first call, so a bad token can never break app startup.
    return new LiveXeroProvider();
  }
  return new MockXeroProvider();
}

export const xero: XeroProvider = createProvider();
export const xeroMode = mode;
export type { XeroProvider } from "./provider";
export * from "./types";
