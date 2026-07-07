/** Naming-convention test↔source matching, shared by the map and the test oracle. */

function stem(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base
    .replace(/\.(test|spec)(?=\.[cm]?[jt]sx?$)/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/^test_/, "")
    .replace(/_test$/, "");
}

function dirSegments(path: string): string[] {
  const i = path.lastIndexOf("/");
  // Drop the first segment (src/ vs tests/ roots differ by convention).
  return i < 0 ? [] : path.slice(0, i).split("/").slice(1);
}

/** True when the test file's name mirrors the source file (same stem, compatible dir tail). */
export function nameMatchesSource(testPath: string, sourcePath: string): boolean {
  if (stem(testPath) !== stem(sourcePath)) return false;
  const t = dirSegments(testPath);
  const s = dirSegments(sourcePath);
  const shorter = t.length <= s.length ? t : s;
  const longer = t.length <= s.length ? s : t;
  return shorter.every((seg, i) => longer[longer.length - shorter.length + i] === seg);
}
