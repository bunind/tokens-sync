import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchGlob } from "./glob.ts";

describe("matchGlob", () => {
  it("exact match", () => {
    assert.equal(matchGlob("manifest.json", "manifest.json"), true);
    assert.equal(matchGlob("other.json", "manifest.json"), false);
  });

  it("** matches arbitrary subdirectories", () => {
    assert.equal(matchGlob("resolver/resolve.mjs", "resolver/**"), true);
    assert.equal(matchGlob("resolver/sub/deep/file.mjs", "resolver/**"), true);
    assert.equal(matchGlob("other/foo.mjs", "resolver/**"), false);
  });

  it("* does not cross slashes", () => {
    assert.equal(matchGlob("foo.json", "*.json"), true);
    assert.equal(matchGlob("a/foo.json", "*.json"), false);
  });

  it("escapes regex specials in literal path segments", () => {
    assert.equal(matchGlob("foo.tokens.json", "*.tokens.json"), true);
    assert.equal(matchGlob("foo-tokens-json", "*.tokens.json"), false);
  });

  it("normalizes Windows-style separators", () => {
    assert.equal(matchGlob("resolver\\sub\\file.mjs", "resolver/**"), true);
  });
});
