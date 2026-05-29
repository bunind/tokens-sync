import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emitCss, flatten, varName, renderValue, classify } from "./css.ts";
import type { DtcgFile } from "./types.ts";

const THEME_EXT = "default.modes";

describe("varName", () => {
  it("mirrors DTCG paths 1:1, collapsing non-alphanumerics", () => {
    assert.equal(varName("color.blue.light.6"), "--color-blue-light-6");
    assert.equal(varName("size.size-unit.12"), "--size-size-unit-12");
    assert.equal(varName("typography.font-size.body"), "--typography-font-size-body");
  });

  it("rewrites a middle-dot segment in the name", () => {
    assert.equal(varName("border.border-stroke.0·5"), "--border-border-stroke-0-5");
  });

  it("lowercases mixed-case Figma segments", () => {
    assert.equal(varName("color.Blue.Light.6"), "--color-blue-light-6");
  });
});

describe("renderValue", () => {
  const known = new Set(["--size-size-unit-12", "--border-border-stroke-0-5"]);

  it("emits color hex verbatim", () => {
    assert.equal(renderValue("color", "#2567eb", known), "#2567eb");
    assert.equal(renderValue("color", "#ffffff80", known), "#ffffff80");
  });

  it("adds px to dimensions but not to fontWeight/number", () => {
    assert.equal(renderValue("dimension", 16, known), "16px");
    assert.equal(renderValue("dimension", 0, known), "0px");
    assert.equal(renderValue("fontWeight", 500, known), "500");
    assert.equal(renderValue("number", 0.5, known), "0.5");
  });

  it("strips Figma float noise", () => {
    assert.equal(renderValue("dimension", 0.10000000149011612, known), "0.1px");
    assert.equal(renderValue("dimension", 23.299999237060547, known), "23.3px");
    assert.equal(renderValue("dimension", -0.20000000298023224, known), "-0.2px");
  });

  it("turns {a.b.c} references into var(--a-b-c), never inlining", () => {
    assert.equal(renderValue("dimension", "{size.size-unit.12}", known), "var(--size-size-unit-12)");
    assert.equal(
      renderValue("dimension", "{border.border-stroke.0·5}", known),
      "var(--border-border-stroke-0-5)",
    );
  });

  it("quotes font families with spaces, leaves bare idents alone", () => {
    assert.equal(renderValue("fontFamily", "Inter", known), "Inter");
    assert.equal(renderValue("fontFamily", "pt serif", known), '"pt serif"');
  });

  it("warns on an unknown reference but still emits a var()", () => {
    const warnings: string[] = [];
    const out = renderValue("color", "{color.does.not.exist}", known, (m) => warnings.push(m));
    assert.equal(out, "var(--color-does-not-exist)");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /unknown reference/);
  });
});

describe("flatten", () => {
  it("indexes leaves by dotted path including the collection slug", () => {
    const files: DtcgFile[] = [
      {
        path: "color/color.tokens.json",
        content: { color: { blue: { "6": { $type: "color", $value: "#2567eb" } } } },
      },
    ];
    const nodes = flatten(files, THEME_EXT);
    const node = nodes.find((n) => n.path === "color.blue.6");
    assert.ok(node);
    assert.equal(node!.slug, "color");
    assert.equal(node!.$type, "color");
    assert.equal(node!.value, "#2567eb");
    assert.equal(node!.modes, undefined);
  });

  it("captures modes from the configured theme extension", () => {
    const files: DtcgFile[] = [
      {
        path: "typography/typography.tokens.json",
        content: {
          typography: {
            "line-height": {
              $type: "dimension",
              $value: 22,
              $extensions: { "default.modes": { desktop: 22, mobile: 24 } },
            },
          },
        },
      },
    ];
    const nodes = flatten(files, THEME_EXT);
    const node = nodes.find((n) => n.path === "typography.line-height");
    assert.deepEqual(node!.modes, { desktop: 22, mobile: 24 });
  });
});

describe("classify", () => {
  it("maps light/dark to the theme strategy", () => {
    const c = classify("theme", ["light", "dark"], undefined);
    assert.equal(c.strategy, "theme");
    assert.equal(c.attr, "theme");
    assert.equal(c.defaultMode, "light");
  });

  it("maps platform-ish modes to the platform strategy", () => {
    const c = classify("typography", ["desktop", "mobile"], undefined);
    assert.equal(c.strategy, "platform");
    assert.equal(c.attr, "platform");
    assert.equal(c.defaultMode, "desktop");
  });

  it("maps size sets to the component strategy", () => {
    const c = classify("button", ["medium", "small", "large"], undefined);
    assert.equal(c.strategy, "component");
    assert.equal(c.attr, "size");
    assert.equal(c.defaultMode, "medium");
  });

  it("treats single-mode (or modeless) collections as static", () => {
    assert.equal(classify("colors", [], undefined).strategy, "static");
    assert.equal(classify("colors", ["only"], undefined).strategy, "static");
  });

  it("honors a config override", () => {
    const c = classify("exotic", ["a", "b"], { strategy: "theme", attr: "mode", default: "b" });
    assert.equal(c.strategy, "theme");
    assert.equal(c.attr, "mode");
    assert.equal(c.defaultMode, "b");
  });
});

describe("emitCss override blocks", () => {
  it("includes only modes whose value differs from the default", () => {
    const files: DtcgFile[] = [
      {
        path: "button/button.tokens.json",
        content: {
          button: {
            size: {
              $type: "dimension",
              $value: 40,
              $extensions: { "default.modes": { medium: 40, small: 32 } },
            },
            radius: {
              $type: "dimension",
              $value: 8,
              $extensions: { "default.modes": { medium: 8, small: 8 } },
            },
          },
        },
      },
    ];
    const css = emitCss(files, { themeExtension: THEME_EXT });
    const block = css.slice(css.indexOf('[data-component="button"][data-size="small"]'));
    assert.match(block, /--button-size: 32px;/);
    assert.doesNotMatch(block, /--button-radius/); // unchanged from default → inherited
  });
});

describe("emitCss snapshot", () => {
  it("renders globals + theme + component in cascade order", () => {
    const files: DtcgFile[] = [
      {
        path: "color/color.tokens.json",
        content: {
          color: {
            base: {
              white: { $type: "color", $value: "#ffffff" },
              black: { $type: "color", $value: "#000000" },
            },
            brand: { primary: { $type: "color", $value: "#2567eb" } },
          },
        },
      },
      {
        path: "theme/theme.tokens.json",
        content: {
          theme: {
            surface: {
              page: {
                $type: "color",
                $value: "{color.base.white}",
                $extensions: {
                  "default.modes": { light: "{color.base.white}", dark: "{color.base.black}" },
                },
              },
            },
            text: {
              default: {
                $type: "color",
                $value: "{color.base.black}",
                $extensions: {
                  "default.modes": { light: "{color.base.black}", dark: "{color.base.white}" },
                },
              },
            },
          },
        },
      },
      {
        path: "button/button.tokens.json",
        content: {
          button: {
            size: {
              $type: "dimension",
              $value: 40,
              $extensions: { "default.modes": { medium: 40, small: 32 } },
            },
          },
        },
      },
    ];

    const expected = `/* Generated by tokens-sync — do not edit. Source: DTCG token tree. */

:root {
  --button-size: 40px;
  --color-base-black: #000000;
  --color-base-white: #ffffff;
  --color-brand-primary: #2567eb;
  --theme-surface-page: var(--color-base-white);
  --theme-text-default: var(--color-base-black);
}

:root[data-theme="dark"] {
  --theme-surface-page: var(--color-base-black);
  --theme-text-default: var(--color-base-white);
}

[data-component="button"][data-size="small"] {
  --button-size: 32px;
}
`;

    assert.equal(emitCss(files, { themeExtension: THEME_EXT }), expected);
  });
});
