import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.ts";

async function tmp(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "dtcg-config-"));
}

describe("loadConfig", () => {
  it("returns empty config when no file is found", async () => {
    const dir = await tmp();
    try {
      const result = await loadConfig(undefined, dir);
      assert.equal(result.configPath, null);
      assert.deepEqual(result.config, {});
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("walks upward from cwd until it finds a config", async () => {
    const root = await tmp();
    try {
      const nested = join(root, "a", "b", "c");
      await mkdir(nested, { recursive: true });
      await writeFile(
        join(root, "tokens-sync.config.json"),
        JSON.stringify({ out: "./tokens", themeExtension: "pui.modes" }),
        "utf8",
      );
      const result = await loadConfig(undefined, nested);
      assert.equal(result.configPath, join(root, "tokens-sync.config.json"));
      assert.equal(result.config.out, "./tokens");
      assert.equal(result.config.themeExtension, "pui.modes");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects malformed config shapes", async () => {
    const dir = await tmp();
    try {
      await writeFile(
        join(dir, "tokens-sync.config.json"),
        JSON.stringify({ out: 42 }),
        "utf8",
      );
      await assert.rejects(loadConfig(undefined, dir), /"out" must be/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed JSON", async () => {
    const dir = await tmp();
    try {
      await writeFile(join(dir, "tokens-sync.config.json"), "{not json", "utf8");
      await assert.rejects(loadConfig(undefined, dir), /Invalid JSON/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
