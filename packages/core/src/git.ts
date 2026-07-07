import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { HarnessError } from "./errors";

const pexec = promisify(execFile);

export function requireGitRepo(root: string): void {
  if (!existsSync(path.join(root, ".git"))) {
    throw new HarnessError("env", "Not a git repository (this feature needs a diff).", "Run `git init` first.");
  }
}

async function git(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await pexec("git", ["-C", root, ...args], { maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    throw new HarnessError("env", `git ${args[0]} failed: ${msg}`, "Check that git works in this repo.");
  }
}

/** Staged + unstaged + untracked paths (posix), renames resolved to the new path. */
export async function changedFiles(root: string): Promise<string[]> {
  requireGitRepo(root);
  const out = await git(root, ["status", "--porcelain"]);
  const files = new Set<string>();
  for (const line of out.split("\n")) {
    if (line.trim() === "") continue;
    let rest = line.slice(3);
    const arrow = rest.indexOf(" -> ");
    if (arrow >= 0) rest = rest.slice(arrow + 4);
    files.add(rest.replace(/^"|"$/g, ""));
  }
  return [...files].sort();
}

export interface ParsedDiffFile {
  path: string;
  oldPath: string | null;
  insertions: number;
  deletions: number;
  status: "added" | "modified" | "deleted" | "renamed";
  /** Added line contents ("+" lines), for content rules; capped. */
  addedLines: string[];
}

const MAX_ADDED_LINES_PER_FILE = 2000;

/** Parse `git diff` for staged changes or an explicit range. */
export async function parseDiff(root: string, range: string | null): Promise<ParsedDiffFile[]> {
  requireGitRepo(root);
  const args = ["diff", "--no-color", "-M", ...(range ? [range] : ["--cached"])];
  const out = await git(root, args);
  const files: ParsedDiffFile[] = [];
  let current: ParsedDiffFile | null = null;
  for (const line of out.split("\n")) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (header) {
      current = {
        path: header[2]!,
        oldPath: header[1] === header[2] ? null : header[1]!,
        insertions: 0,
        deletions: 0,
        status: "modified",
        addedLines: [],
      };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("new file mode")) current.status = "added";
    else if (line.startsWith("deleted file mode")) current.status = "deleted";
    else if (line.startsWith("rename from")) current.status = "renamed";
    else if (line.startsWith("+") && !line.startsWith("+++")) {
      current.insertions += 1;
      if (current.addedLines.length < MAX_ADDED_LINES_PER_FILE) current.addedLines.push(line.slice(1));
    } else if (line.startsWith("-") && !line.startsWith("---")) current.deletions += 1;
  }
  return files;
}
