import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DtcgFile } from "./types.ts";

const TOKENS_SUFFIX = ".tokens.json";

export interface LoadDtcgOptions {
  /** Sink for non-fatal diagnostics (e.g. malformed files). Defaults to no-op. */
  warn?: (message: string) => void;
}

/**
 * Walk a DTCG token tree and parse every `*.tokens.json` under it. The loader
 * the CSS stage assumed already existed — `input.ts` only resolves a single
 * raw Figma path, and `glob.ts` only matches patterns; neither walks a dir.
 *
 * Malformed JSON is skipped with a warning rather than aborting the whole emit,
 * so one bad file never blocks regenerating the rest of `tokens.css`.
 */
export async function loadDtcg(dir: string, opts: LoadDtcgOptions = {}): Promise<DtcgFile[]> {
  const warn = opts.warn ?? (() => {});

  let entries: string[];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch (err) {
    throw new Error(`cannot read tokens directory at ${dir}: ${(err as Error).message}`);
  }

  const relPaths = entries.filter((p) => p.endsWith(TOKENS_SUFFIX)).sort();
  const files: DtcgFile[] = [];

  for (const relPath of relPaths) {
    let raw: string;
    try {
      raw = await readFile(join(dir, relPath), "utf8");
    } catch (err) {
      warn(`skipping unreadable file ${relPath}: ${(err as Error).message}`);
      continue;
    }
    let content: unknown;
    try {
      content = JSON.parse(raw);
    } catch (err) {
      warn(`skipping malformed JSON in ${relPath}: ${(err as Error).message}`);
      continue;
    }
    if (typeof content !== "object" || content === null || Array.isArray(content)) {
      warn(`skipping ${relPath}: top level is not a DTCG object`);
      continue;
    }
    files.push({ path: relPath, content: content as Record<string, unknown> });
  }

  return files;
}
