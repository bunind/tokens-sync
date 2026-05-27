import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFiles } from "./writer.ts";

async function tmp(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "dtcg-writer-"));
}

describe("writeFiles", () => {
  it("writes new files and ignores preserved paths", async () => {
    const dir = await tmp();
    try {
      const files = [
        { path: "global/global.tokens.json", content: { global: { foo: 1 } } },
        { path: "manifest.json", content: { ignored: true } },
        { path: "resolver/resolve.tokens.json", content: { ignored: true } },
      ];
      const plan = await writeFiles(files, {
        outDir: dir,
        preserve: ["manifest.json", "resolver/**"],
        dryRun: false,
      });
      assert.deepEqual(plan.written, ["global/global.tokens.json"]);
      assert.deepEqual(plan.preserved.sort(), ["manifest.json", "resolver/resolve.tokens.json"]);
      assert.deepEqual(plan.unchanged, []);

      const onDisk = JSON.parse(await readFile(join(dir, "global/global.tokens.json"), "utf8"));
      assert.deepEqual(onDisk, { global: { foo: 1 } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects unchanged files via content compare", async () => {
    const dir = await tmp();
    try {
      const files = [{ path: "a/a.tokens.json", content: { a: 1 } }];
      await writeFiles(files, { outDir: dir, preserve: [], dryRun: false });
      const plan = await writeFiles(files, { outDir: dir, preserve: [], dryRun: false });
      assert.deepEqual(plan.unchanged, ["a/a.tokens.json"]);
      assert.deepEqual(plan.written, []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("dry-run does not touch the filesystem", async () => {
    const dir = await tmp();
    try {
      const files = [{ path: "a/a.tokens.json", content: { a: 1 } }];
      const plan = await writeFiles(files, { outDir: dir, preserve: [], dryRun: true });
      assert.deepEqual(plan.written, ["a/a.tokens.json"]);
      await assert.rejects(readFile(join(dir, "a/a.tokens.json"), "utf8"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserve glob does not overwrite an existing resolver file", async () => {
    const dir = await tmp();
    try {
      await mkdir(join(dir, "resolver"), { recursive: true });
      await writeFile(join(dir, "resolver", "resolve.mjs"), "export default {};", "utf8");

      const files = [{ path: "resolver/resolve.mjs", content: { rewritten: true } }];
      const plan = await writeFiles(files, {
        outDir: dir,
        preserve: ["resolver/**"],
        dryRun: false,
      });
      assert.deepEqual(plan.preserved, ["resolver/resolve.mjs"]);

      const onDisk = await readFile(join(dir, "resolver", "resolve.mjs"), "utf8");
      assert.equal(onDisk, "export default {};");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
