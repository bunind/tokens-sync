import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface TextWritePlan {
  path: string;
  written: boolean;
  unchanged: boolean;
}

export interface WriteTextOptions {
  dryRun: boolean;
}

/**
 * Idempotent raw-string write with the same written/unchanged reporting as
 * `writer.ts`. We cannot reuse `writeFiles` for CSS: it does
 * `JSON.stringify(content)` and would emit a JSON-quoted blob, not CSS.
 */
export async function writeText(
  path: string,
  content: string,
  opts: WriteTextOptions,
): Promise<TextWritePlan> {
  let existing: string | null = null;
  try {
    existing = await readFile(path, "utf8");
  } catch {
    // missing — first write
  }

  if (existing === content) {
    return { path, written: false, unchanged: true };
  }

  if (!opts.dryRun) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
  return { path, written: true, unchanged: false };
}
