import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, isAbsolute, join } from "node:path";

const FILE_PATTERN = /^tokens-(.+)\.json$/;

export interface ResolveInputOptions {
  positional: string | undefined;
  inputFlag: string | undefined;
  cwd: string;
  downloadsDir?: string;
}

export async function resolveInputPath(opts: ResolveInputOptions): Promise<string> {
  const { positional, inputFlag, cwd } = opts;

  if (inputFlag) return absolutize(inputFlag, cwd);

  if (!positional) {
    throw new Error(
      "Missing input. Provide a Figma file key or a path to a raw JSON file (or pass --input).",
    );
  }

  if (looksLikePath(positional) || existsSync(absolutize(positional, cwd))) {
    return absolutize(positional, cwd);
  }

  const downloads = opts.downloadsDir ?? join(homedir(), "Downloads");
  const found = await newestExportForKey(downloads, positional);
  if (!found) {
    throw new Error(
      `No "tokens-${positional}.json" found in ${downloads}. ` +
        `Run the Figma plugin first, or pass --input <path>.`,
    );
  }
  return found;
}

function absolutize(p: string, cwd: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return isAbsolute(p) ? p : resolve(cwd, p);
}

function looksLikePath(s: string): boolean {
  return s.includes("/") || s.includes("\\") || s.endsWith(".json") || s.startsWith("~");
}

async function newestExportForKey(dir: string, key: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const candidates: { path: string; mtime: number }[] = [];
  for (const name of entries) {
    const m = name.match(FILE_PATTERN);
    if (!m || (m[1] !== key && !m[1]!.startsWith(`${key}-`))) continue;
    const full = join(dir, name);
    try {
      const st = await stat(full);
      candidates.push({ path: full, mtime: st.mtimeMs });
    } catch {
      // ignore unreadable entries
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]!.path;
}
