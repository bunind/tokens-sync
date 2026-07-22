import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapToDtcg, slugify, normalizeModeName } from "./mapper.ts";
import type { FigmaVarsExport } from "./types.ts";

describe("slugify", () => {
  it("kebab-lowercases, no camelCase splitting", () => {
    assert.equal(slugify("App Bar"), "app-bar");
    assert.equal(slugify("  multiple   spaces  "), "multiple-spaces");
    assert.equal(slugify("DropdownMenu"), "dropdownmenu");
    assert.equal(slugify("under_scored"), "under-scored");
    assert.equal(slugify("trailing-"), "trailing");
  });
});

describe("normalizeModeName", () => {
  it("lowercases verbatim, keeps spaces", () => {
    assert.equal(normalizeModeName("Light"), "light");
    assert.equal(normalizeModeName("High Contrast"), "high contrast");
    assert.equal(normalizeModeName("XLarge"), "xlarge");
  });
});

describe("mapToDtcg", () => {
  it("emits one file per collection, slugged path, flat layout", () => {
    const fixture: FigmaVarsExport = {
      fileKey: "ABC",
      collections: [
        { id: "c1", name: "Global", defaultModeId: "m1", modes: [{ id: "m1", name: "Default" }] },
      ],
      variables: [
        {
          id: "v1",
          name: "color/red",
          collectionId: "c1",
          type: "COLOR",
          scopes: [],
          valuesByMode: { m1: { kind: "literal", value: { r: 1, g: 0, b: 0, a: 1 } } },
        },
      ],
    };
    const files = mapToDtcg(fixture);
    assert.equal(files.length, 1);
    assert.equal(files[0]!.path, "global/global.tokens.json");
    const t = files[0]!.content as Record<string, Record<string, Record<string, { $type: string; $value: string }>>>;
    assert.equal(t.global!.color!.red!.$type, "color");
    assert.equal(t.global!.color!.red!.$value, "#ff0000");
  });

  it("multi-mode collections use $extensions[themeExtension]", () => {
    const fixture: FigmaVarsExport = {
      fileKey: "ABC",
      collections: [
        {
          id: "c1",
          name: "Theme",
          defaultModeId: "m1",
          modes: [
            { id: "m1", name: "Light" },
            { id: "m2", name: "Dark" },
          ],
        },
      ],
      variables: [
        {
          id: "v1",
          name: "bg",
          collectionId: "c1",
          type: "COLOR",
          scopes: [],
          valuesByMode: {
            m1: { kind: "literal", value: { r: 1, g: 1, b: 1, a: 1 } },
            m2: { kind: "literal", value: { r: 0, g: 0, b: 0, a: 1 } },
          },
        },
      ],
    };
    const files = mapToDtcg(fixture, "default.modes");
    const leaf = (files[0]!.content as { theme: { bg: { $value: string; $extensions: Record<string, Record<string, string>> } } }).theme.bg;
    assert.equal(leaf.$value, "#ffffff");
    assert.deepEqual(leaf.$extensions["default.modes"], { light: "#ffffff", dark: "#000000" });
  });

  it("preserves aliases as {collection.path} strings across collections", () => {
    const fixture: FigmaVarsExport = {
      fileKey: "ABC",
      collections: [
        { id: "c1", name: "Global", defaultModeId: "m1", modes: [{ id: "m1", name: "Default" }] },
        { id: "c2", name: "Theme", defaultModeId: "m2", modes: [{ id: "m2", name: "Default" }] },
      ],
      variables: [
        {
          id: "v1",
          name: "color/red",
          collectionId: "c1",
          type: "COLOR",
          scopes: [],
          valuesByMode: { m1: { kind: "literal", value: { r: 1, g: 0, b: 0, a: 1 } } },
        },
        {
          id: "v2",
          name: "bg",
          collectionId: "c2",
          type: "COLOR",
          scopes: [],
          valuesByMode: { m2: { kind: "alias", variableId: "v1" } },
        },
      ],
    };
    const files = mapToDtcg(fixture);
    const theme = files.find((f) => f.path === "theme/theme.tokens.json")!;
    const leaf = (theme.content as { theme: { bg: { $value: string } } }).theme.bg;
    assert.equal(leaf.$value, "{global.color.red}");
  });

  it("strips redundant leading collection segment from variable names", () => {
    const fixture: FigmaVarsExport = {
      fileKey: "ABC",
      collections: [
        { id: "c1", name: "Color", defaultModeId: "m1", modes: [{ id: "m1", name: "Default" }] },
      ],
      variables: [
        {
          id: "v1",
          name: "color/red/500",
          collectionId: "c1",
          type: "COLOR",
          scopes: [],
          valuesByMode: { m1: { kind: "literal", value: { r: 1, g: 0, b: 0, a: 1 } } },
        },
      ],
    };
    const files = mapToDtcg(fixture);
    const t = files[0]!.content as { color: { red: { "500": { $value: string } } } };
    assert.equal(t.color.red["500"]!.$value, "#ff0000");
  });

  it("emits rgba hex when alpha < 1", () => {
    const fixture: FigmaVarsExport = {
      fileKey: "ABC",
      collections: [
        { id: "c1", name: "Color", defaultModeId: "m1", modes: [{ id: "m1", name: "Default" }] },
      ],
      variables: [
        {
          id: "v1",
          name: "alpha/50",
          collectionId: "c1",
          type: "COLOR",
          scopes: [],
          valuesByMode: { m1: { kind: "literal", value: { r: 0, g: 0, b: 0, a: 0.5 } } },
        },
      ],
    };
    const files = mapToDtcg(fixture);
    const t = files[0]!.content as { color: { alpha: { "50": { $value: string } } } };
    assert.equal(t.color.alpha["50"]!.$value, "#00000080");
  });

  it("infers $type from scope (FONT_FAMILY → fontFamily, FONT_WEIGHT → fontWeight)", () => {
    const fixture: FigmaVarsExport = {
      fileKey: "ABC",
      collections: [
        { id: "c1", name: "Typography", defaultModeId: "m1", modes: [{ id: "m1", name: "Default" }] },
      ],
      variables: [
        {
          id: "v1",
          name: "family/sans",
          collectionId: "c1",
          type: "STRING",
          scopes: ["FONT_FAMILY"],
          valuesByMode: { m1: { kind: "literal", value: "Inter" } },
        },
        {
          id: "v2",
          name: "weight/bold",
          collectionId: "c1",
          type: "FLOAT",
          scopes: ["FONT_WEIGHT"],
          valuesByMode: { m1: { kind: "literal", value: 700 } },
        },
      ],
    };
    const files = mapToDtcg(fixture);
    const t = files[0]!.content as {
      typography: {
        family: { sans: { $type: string } };
        weight: { bold: { $type: string } };
      };
    };
    assert.equal(t.typography.family.sans.$type, "fontFamily");
    assert.equal(t.typography.weight.bold.$type, "fontWeight");
  });

  it("drops Figma variant-switcher STRING vars, keeps other strings", () => {
    const fixture: FigmaVarsExport = {
      fileKey: "ABC",
      collections: [
        {
          id: "c1",
          name: "Badge",
          defaultModeId: "m1",
          modes: [
            { id: "m1", name: "Small" },
            { id: "m2", name: "Large" },
          ],
        },
      ],
      variables: [
        {
          id: "v1",
          name: "badge/item/size",
          collectionId: "c1",
          type: "STRING",
          scopes: ["ALL_SCOPES"],
          valuesByMode: {
            m1: { kind: "literal", value: "Small" },
            m2: { kind: "literal", value: "Large" },
          },
        },
        {
          id: "v2",
          name: "badge/stroke-style",
          collectionId: "c1",
          type: "STRING",
          scopes: [],
          valuesByMode: {
            m1: { kind: "literal", value: "solid" },
            m2: { kind: "literal", value: "solid" },
          },
        },
      ],
    };
    const files = mapToDtcg(fixture);
    const t = files[0]!.content as { badge: Record<string, unknown> };
    assert.equal(t.badge.item, undefined);
    assert.ok(t.badge["stroke-style"]);
  });
});
