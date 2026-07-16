import fs from "fs";
import path from "path";

const STORE_DIR = path.join(process.cwd(), ".mcp-tokens");

export interface ProviderStore {
  clientInformation?: unknown;
  tokens?: unknown;
  codeVerifier?: string;
  discoveryState?: unknown;
}

function filePath(provider: string): string {
  return path.join(STORE_DIR, `${provider}.json`);
}

export function readStore(provider: string): ProviderStore {
  try {
    return JSON.parse(fs.readFileSync(filePath(provider), "utf8")) as ProviderStore;
  } catch {
    return {};
  }
}

export function writeStore(provider: string, patch: Partial<ProviderStore>): void {
  // Tokens are plaintext on disk, so keep the store owner-only readable.
  fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  const next = { ...readStore(provider), ...patch };
  fs.writeFileSync(filePath(provider), JSON.stringify(next, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(filePath(provider), 0o600); // writeFileSync's mode only applies to newly-created files
  } catch {
    // best-effort on non-POSIX filesystems
  }
}

export function isConnected(provider: string): boolean {
  return Boolean(readStore(provider).tokens);
}
