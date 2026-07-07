import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MANIFEST_PATH,
  MAP_PATH,
  buildFileIndex,
  computeInputsHash,
  loadConfig,
} from "@iknowkungfu/core";
import {
  parseManifest,
  parseMap,
  type HarnessConfig,
  type ProjectMap,
  type RepoManifest,
} from "@iknowkungfu/schemas";

export interface HarnessState {
  manifest: RepoManifest;
  map: ProjectMap;
  config: HarnessConfig;
  stale: boolean;
}

export interface StateError {
  code: "usage" | "env";
  message: string;
  fix: string;
}

const STALE_CACHE_MS = 10_000;
let staleCache: { root: string; hash: string; at: number } | null = null;

function readJson(root: string, rel: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path.join(root, ...rel.split("/")), "utf8"));
  } catch {
    return null;
  }
}

async function currentHash(root: string, configRaw: string | null): Promise<string> {
  const now = Date.now();
  if (staleCache && staleCache.root === root && now - staleCache.at < STALE_CACHE_MS) return staleCache.hash;
  const index = await buildFileIndex(root, { excludes: loadConfig(root).config.excludes });
  const hash = computeInputsHash(index, configRaw);
  staleCache = { root, hash, at: now };
  return hash;
}

export function invalidateStaleCache(): void {
  staleCache = null;
}

export async function loadState(root: string): Promise<HarnessState | StateError> {
  const manifestJson = readJson(root, MANIFEST_PATH);
  const mapJson = readJson(root, MAP_PATH);
  if (manifestJson === null || mapJson === null) {
    return { code: "usage", message: "No iknowkungfu manifest found in this repo.", fix: "Run `iknowkungfu init` first." };
  }
  let manifest: RepoManifest;
  let map: ProjectMap;
  let loaded: ReturnType<typeof loadConfig>;
  try {
    manifest = parseManifest(manifestJson);
    map = parseMap(mapJson);
    loaded = loadConfig(root);
  } catch (err) {
    const detail = err instanceof Error ? err.message.split("\n")[0] : "parse error";
    return { code: "usage", message: `Harness files failed validation: ${detail}`, fix: "Run `iknowkungfu refresh --force`." };
  }
  const stale = (await currentHash(root, loaded.raw)) !== manifest.inputsHash;
  return { manifest, map, config: loaded.config, stale };
}

export function isStateError(state: HarnessState | StateError): state is StateError {
  return "code" in state;
}
