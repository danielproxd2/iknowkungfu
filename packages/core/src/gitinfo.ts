import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const pexec = promisify(execFile);

/** Commit count of the repo rooted AT `root` (not an enclosing repo); null if absent/unreadable. */
export async function gitCommitCount(root: string): Promise<number | null> {
  if (!existsSync(path.join(root, ".git"))) return null;
  try {
    const { stdout } = await pexec("git", ["-C", root, "rev-list", "--count", "HEAD"]);
    const n = Number(stdout.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
