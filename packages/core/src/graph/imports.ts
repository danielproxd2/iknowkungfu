import { init as lexerInit, parse as lexerParse } from "es-module-lexer";

export const JS_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

export function isJsFile(path: string): boolean {
  return JS_EXTS.some((e) => path.endsWith(e));
}
export function isPyFile(path: string): boolean {
  return path.endsWith(".py");
}

let lexerReady: Promise<void> | null = null;
export function initImportParser(): Promise<void> {
  lexerReady ??= lexerInit.then(() => undefined);
  return lexerReady;
}

const JS_IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?:[^;'"]+?\s+from\s+)?['"]([^'"\n]+)['"]|require\(\s*['"]([^'"\n]+)['"]\s*\)|import\(\s*['"]([^'"\n]+)['"]\s*\)/g;

/** es-module-lexer where it parses; regex fallback for TS-heavy syntax it rejects. */
export function jsImportSpecifiers(source: string): string[] {
  try {
    const [imports] = lexerParse(source);
    const out: string[] = [];
    for (const imp of imports) if (imp.n) out.push(imp.n);
    return out;
  } catch {
    const out: string[] = [];
    for (const m of source.matchAll(JS_IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (spec) out.push(spec);
    }
    return out;
  }
}

export interface PyImport {
  /** Dotted module ("app.models"); relative imports keep leading dots (".db", "..core.x"). */
  module: string;
}

export function pyImportSpecifiers(source: string): PyImport[] {
  const out: PyImport[] = [];
  for (const line of source.split(/\r?\n/)) {
    const from = line.match(/^\s*from\s+([\w.]+)\s+import\b/);
    if (from?.[1]) {
      out.push({ module: from[1] });
      continue;
    }
    const plain = line.match(/^\s*import\s+([\w.,\s]+)/);
    if (plain?.[1]) {
      for (const part of plain[1].split(",")) {
        const mod = part.trim().split(/\s+as\s+/)[0];
        if (mod) out.push({ module: mod });
      }
    }
  }
  return out;
}
