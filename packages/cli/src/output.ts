import type { RepoManifest } from "@iknowkungfu/schemas";

export function table(rows: string[][]): string {
  if (rows.length === 0) return "";
  const first = rows[0]!;
  const widths = first.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)));
  return rows.map((r) => r.map((cell, i) => (cell ?? "").padEnd(widths[i] ?? 0)).join("  ").trimEnd()).join("\n");
}

export function summarizeStack(manifest: RepoManifest): string {
  const parts: string[] = [];
  const fw = manifest.stack.frameworks.filter((f) => !f.value.startsWith("typescript")).slice(0, 4);
  if (fw.length > 0) parts.push(fw.map((f) => f.value).join(" · "));
  const lang = manifest.stack.languages[0];
  if (lang) parts.push(`${lang.value.name} ${lang.value.percent}%`);
  if (manifest.stack.packageManager) parts.push(manifest.stack.packageManager.value);
  if (manifest.stack.runtime) parts.push(manifest.stack.runtime.value);
  return parts.join(" · ") || "(no stack detected)";
}

export function printScanSummary(manifest: RepoManifest): void {
  const lines: string[] = [];
  lines.push(`iknowkungfu v${manifest.harnessVersion} — scan`);
  lines.push(`Stack: ${summarizeStack(manifest)}`);
  lines.push(`Files: ${manifest.stats.files}`);
  lines.push("");
  const rows = [["KIND", "COMMAND", "PROVENANCE", "SOURCE"]];
  for (const c of manifest.commands.commands) rows.push([c.kind, c.command, c.provenance, c.source]);
  lines.push(rows.length > 1 ? table(rows) : "No commands detected.");
  if (manifest.warnings.length > 0) {
    lines.push("");
    lines.push(`Warnings (${manifest.warnings.length}):`);
    for (const w of manifest.warnings.slice(0, 10)) lines.push(`  ⚠ ${w}`);
  }
  console.log(lines.join("\n"));
}
