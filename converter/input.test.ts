import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInputPath } from "./input.ts";

async function tmp(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "dtcg-input-"));
}

describe("resolveInputPath", () => {
  it("returns the positional verbatim when it looks like a path", async () => {
    const dir = await tmp();
    try {
      const file = join(dir, "tokens-XYZ.json");
      await writeFile(file, "{}", "utf8");
      const out = await resolveInputPath({
        positional: file,
        inputFlag: undefined,
        cwd: dir,
      });
      assert.equal(out, file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prefers --input over positional", async () => {
    const dir = await tmp();
    try {
      const explicit = join(dir, "explicit.json");
      await writeFile(explicit, "{}", "utf8");
      const out = await resolveInputPath({
        positional: "ABC",
        inputFlag: explicit,
        cwd: dir,
      });
      assert.equal(out, explicit);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resolves file key against the provided downloads dir, newest mtime wins", async () => {
    const downloads = await tmp();
    try {
      const older = join(downloads, "tokens-ABC-2024-01-01.json");
      const newer = join(downloads, "tokens-ABC-2024-02-02.json");
      const sibling = join(downloads, "tokens-OTHER-2024-01-01.json");
      await writeFile(older, "{}", "utf8");
      await writeFile(newer, "{}", "utf8");
      await writeFile(sibling, "{}", "utf8");

      const past = new Date(Date.now() - 60_000);
      await utimes(older, past, past);

      const out = await resolveInputPath({
        positional: "ABC",
        inputFlag: undefined,
        cwd: downloads,
        downloadsDir: downloads,
      });
      assert.equal(out, newer);
    } finally {
      await rm(downloads, { recursive: true, force: true });
    }
  });

  it("errors when the file key has no matching downloads", async () => {
    const downloads = await tmp();
    try {
      await assert.rejects(
        resolveInputPath({
          positional: "MISSING",
          inputFlag: undefined,
          cwd: downloads,
          downloadsDir: downloads,
        }),
        /No "tokens-MISSING/,
      );
    } finally {
      await rm(downloads, { recursive: true, force: true });
    }
  });

  it("errors when neither positional nor --input is provided", async () => {
    await assert.rejects(
      resolveInputPath({ positional: undefined, inputFlag: undefined, cwd: process.cwd() }),
      /Missing input/,
    );
  });
});
