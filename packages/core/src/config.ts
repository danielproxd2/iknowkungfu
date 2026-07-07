import { readFileSync } from "node:fs";
import path from "node:path";
import { parseConfig, type HarnessConfig } from "@repo-harness/schemas/config";
import { HarnessError } from "./errors";

export const HARNESS_DIR = ".repo-harness";
export const CONFIG_PATH = `${HARNESS_DIR}/config.json`;
export const MANIFEST_PATH = `${HARNESS_DIR}/manifest.json`;

export interface LoadedConfig {
  config: HarnessConfig;
  /** Raw file content for hashing; null when the file doesn't exist. */
  raw: string | null;
}

export function loadConfig(root: string): LoadedConfig {
  let raw: string | null = null;
  try {
    raw = readFileSync(path.join(root, HARNESS_DIR, "config.json"), "utf8");
  } catch {
    raw = null;
  }
  if (raw === null) return { config: parseConfig({}), raw: null };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HarnessError("usage", `${CONFIG_PATH} is not valid JSON.`, `Fix or delete ${CONFIG_PATH} and re-run.`);
  }
  try {
    return { config: parseConfig(json), raw };
  } catch (err) {
    const detail = err instanceof Error ? err.message.split("\n")[0] : "schema mismatch";
    throw new HarnessError("usage", `${CONFIG_PATH} failed validation: ${detail}`, `Fix ${CONFIG_PATH} and re-run.`);
  }
}
