import type { Fact } from "@repo-harness/schemas";
import type { FileIndex } from "../fsindex";

const EXT_LANG: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".rb": "Ruby",
  ".php": "PHP",
  ".c": "C",
  ".h": "C",
  ".cc": "C++",
  ".cpp": "C++",
  ".hpp": "C++",
  ".cs": "C#",
  ".swift": "Swift",
  ".sql": "SQL",
  ".sh": "Shell",
  ".css": "CSS",
  ".scss": "CSS",
  ".html": "HTML",
  ".vue": "Vue",
  ".svelte": "Svelte",
};

/** Byte-weighted language split over recognized code files, largest first, ≥1%. */
export function detectLanguages(index: FileIndex): Fact<{ name: string; percent: number }>[] {
  const bytes = new Map<string, number>();
  for (const file of index.files) {
    const dot = file.lastIndexOf(".");
    if (dot < 0) continue;
    const lang = EXT_LANG[file.slice(dot).toLowerCase()];
    if (!lang) continue;
    bytes.set(lang, (bytes.get(lang) ?? 0) + index.size(file));
  }
  const total = [...bytes.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return [...bytes.entries()]
    .map(([name, b]) => ({ name, percent: Math.round((b / total) * 100) }))
    .filter((l) => l.percent >= 1)
    .sort((a, b) => b.percent - a.percent)
    .map((value) => ({ value, provenance: "detected" as const, source: "extension-histogram" }));
}
