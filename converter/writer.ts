import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { DtcgFile } from "./types.ts";
import { matchGlob } from "./glob.ts";

export interface WritePlan {
  written: string[];
  unchanged: string[];
  preserved: string[];
}

export interface WriteOptions {
  outDir: string;
  preserve: string[];
  dryRun: boolean;
}

export async function writeFiles(files: DtcgFile[], opts: WriteOptions): Promise<WritePlan> {
  const plan: WritePlan = { written: [], unchanged: [], preserved: [] };

  for (const file of files) {
    if (isPreserved(file.path, opts.preserve)) {
      plan.preserved.push(file.path);
      continue;
    }

    const abs = resolve(opts.outDir, file.path);
    const next = JSON.stringify(file.content, null, 2) + "\n";

    let existing: string | null = null;
    try {
      existing = await readFile(abs, "utf8");
    } catch {
      // missing — first write
    }

    if (existing === next) {
      plan.unchanged.push(file.path);
      continue;
    }

    if (!opts.dryRun) {
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, next, "utf8");
    }
    plan.written.push(file.path);
  }
  return plan;
}

function isPreserved(path: string, patterns: string[]): boolean {
  return patterns.some((p) => matchGlob(path, p));
}
