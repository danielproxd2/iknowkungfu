import type { HarnessState, StateError } from "./state";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export function ok(data: Record<string, unknown>, state: HarnessState): ToolResult {
  const payload = { ...data, meta: { manifestHash: state.manifest.inputsHash, stale: state.stale } };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 1) }] };
}

export function err(e: StateError | { code: string; message: string; fix: string }): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: e }) }], isError: true };
}

/** Hard response-size guard: truncate arrays until the payload fits. */
export function capList<T>(items: T[], max: number): { items: T[]; truncated: boolean; total: number } {
  return { items: items.slice(0, max), truncated: items.length > max, total: items.length };
}
