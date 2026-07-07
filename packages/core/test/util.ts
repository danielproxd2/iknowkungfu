import path from "node:path";
import { fileURLToPath } from "node:url";

export function fixture(name: string): string {
  return path.resolve(fileURLToPath(import.meta.url), "../../../../fixtures", name);
}
