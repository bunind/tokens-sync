import type {
  DtcgFile,
  TokenNode,
  SelectorStrategy,
  CssModeOverride,
  CssEmitOptions,
} from "./types.ts";

export const DEFAULT_THEME_EXTENSION = "default.modes";

// Mode-name vocabularies that drive convention-based selector classification.
// These are the *mode* names a collection carries, never the collection slug.
const THEME_MODES = new Set(["light", "dark"]);
const PLATFORM_MODES = new Set(["ios", "android", "web", "desktop", "mobile", "tablet"]);
const SIZE_MODES = new Set([
  "xxsmall", "2xsmall", "xsmall", "x-small", "small",
  "medium", "large", "xlarge", "x-large", "2xlarge", "xxlarge",
]);

interface Classification {
  strategy: SelectorStrategy;
  attr: string;
  defaultMode: string | undefined;
}

// Cascade phases — later wins. Defaults live in :root; overrides layer on top
// in platform → theme → component order (per the plan's cascade contract).
const PHASE = { platform: 1, theme: 2, component: 3 } as const;

interface Block {
  phase: number;
  selector: string;
  decls: Map<string, string>; // varName → rendered value (last write wins)
}

/**
 * Pure pipeline: flatten → classify → render → assemble → stringify.
 * Reads a DTCG tree (already parsed into DtcgFile[]) and returns one
 * self-contained CSS string. No filesystem access — the I/O lives at the edges
 * (dtcg-load.ts in, writeText.ts out) so this stays unit-testable.
 */
export function emitCss(files: DtcgFile[], opts: CssEmitOptions = {}): string {
  const warn = opts.warn ?? (() => {});
  const themeExtension = opts.themeExtension ?? DEFAULT_THEME_EXTENSION;
  const cssModes = opts.cssModes ?? {};

  const nodes = flatten(files, themeExtension, warn);
  const knownVars = new Set(nodes.map((n) => varName(n.path)));

  // 1. :root — every token's default value, alphabetical.
  const rootDecls = new Map<string, string>();
  for (const node of nodes) {
    rootDecls.set(varName(node.path), renderValue(node.$type, node.value, knownVars, warn, node.path));
  }

  // 2. Override blocks, grouped per collection by its mode dimension.
  const byCollection = new Map<string, TokenNode[]>();
  for (const node of nodes) {
    const arr = byCollection.get(node.slug) ?? [];
    arr.push(node);
    byCollection.set(node.slug, arr);
  }

  const blocks = new Map<string, Block>(); // selector → block (merge across collections)
  for (const [slug, collectionNodes] of byCollection) {
    const modeNames = collectModeNames(collectionNodes);
    const cls = classify(slug, modeNames, cssModes[slug], warn);
    if (cls.strategy === "static" || modeNames.length <= 1) continue;

    for (const mode of modeNames) {
      if (mode === cls.defaultMode) continue;
      const selector = selectorFor(cls, slug, mode);
      const block = blocks.get(selector) ?? {
        phase: PHASE[cls.strategy as keyof typeof PHASE] ?? PHASE.platform,
        selector,
        decls: new Map<string, string>(),
      };
      for (const node of collectionNodes) {
        if (!node.modes) continue;
        if (!(mode in node.modes)) {
          warn(`token ${node.path} has no value for mode "${mode}"; inheriting default`);
          continue;
        }
        const modeValue = node.modes[mode];
        if (modeValue === node.value) continue; // identical to :root → inherit
        block.decls.set(
          varName(node.path),
          renderValue(node.$type, modeValue, knownVars, warn, `${node.path}@${mode}`),
        );
      }
      if (block.decls.size > 0) blocks.set(selector, block);
    }
  }

  detectCycles(nodes, warn);

  return stringify(rootDecls, [...blocks.values()]);
}

// ── flatten ────────────────────────────────────────────────────────────────

export function flatten(
  files: DtcgFile[],
  themeExtension: string,
  warn: (m: string) => void = () => {},
): TokenNode[] {
  const nodes: TokenNode[] = [];
  for (const file of files) {
    for (const [topKey, subtree] of Object.entries(file.content)) {
      walk(topKey, slugOf(topKey), [topKey], subtree, themeExtension, nodes, warn);
    }
  }
  return nodes;
}

function walk(
  topKey: string,
  slug: string,
  pathSegs: string[],
  value: unknown,
  themeExtension: string,
  out: TokenNode[],
  warn: (m: string) => void,
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const obj = value as Record<string, unknown>;

  if ("$value" in obj) {
    const node: TokenNode = {
      path: pathSegs.join("."),
      slug,
      $type: typeof obj.$type === "string" ? obj.$type : "",
      value: obj.$value,
    };
    const ext = obj.$extensions as Record<string, unknown> | undefined;
    const modes = ext?.[themeExtension];
    if (modes && typeof modes === "object" && !Array.isArray(modes)) {
      node.modes = modes as Record<string, unknown>;
    }
    out.push(node);
    return;
  }

  for (const [key, child] of Object.entries(obj)) {
    if (key.startsWith("$")) continue; // skip stray DTCG metadata
    walk(topKey, slug, [...pathSegs, key], child, themeExtension, out, warn);
  }
}

function collectModeNames(nodes: TokenNode[]): string[] {
  const set = new Set<string>();
  for (const node of nodes) {
    if (node.modes) for (const m of Object.keys(node.modes)) set.add(m);
  }
  return [...set];
}

// ── classify ─────────────────────────────────────────────────────────────

export function classify(
  slug: string,
  modeNames: string[],
  override: CssModeOverride | undefined,
  warn: (m: string) => void = () => {},
): Classification {
  if (modeNames.length <= 1) {
    return { strategy: "static", attr: "", defaultMode: modeNames[0] };
  }

  let strategy: SelectorStrategy;
  let attr: string;
  if (modeNames.some((m) => THEME_MODES.has(m))) {
    strategy = "theme";
    attr = "theme";
  } else if (modeNames.some((m) => PLATFORM_MODES.has(m))) {
    strategy = "platform";
    attr = "platform";
  } else if (modeNames.some((m) => SIZE_MODES.has(m))) {
    strategy = "component";
    attr = "size";
  } else {
    // Unknown dimension: fall back to a generic root attribute keyed by slug.
    strategy = "platform";
    attr = slug;
    warn(`collection "${slug}" has unrecognized modes [${modeNames.join(", ")}]; using [data-${slug}]`);
  }

  if (override?.strategy) strategy = override.strategy;
  if (override?.attr) attr = override.attr;
  const defaultMode = override?.default ?? detectDefaultMode(modeNames);

  return { strategy, attr, defaultMode };
}

/**
 * The default mode is the one Figma baked into `$value`. We surface it by
 * convention (light/ios/medium first), then fall back to the first declared
 * mode. Token-level skipping already drops any mode whose value equals the
 * default, so an imperfect guess never produces wrong CSS — only a possibly
 * redundant (and then empty, hence dropped) block.
 */
function detectDefaultMode(modeNames: string[]): string {
  const conventionalDefaults = ["light", "ios", "medium", "desktop"];
  for (const d of conventionalDefaults) {
    if (modeNames.includes(d)) return d;
  }
  return modeNames[0]!;
}

function selectorFor(cls: Classification, slug: string, mode: string): string {
  if (cls.strategy === "component") {
    return `[data-component="${slug}"][data-${cls.attr}="${mode}"]`;
  }
  return `:root[data-${cls.attr}="${mode}"]`;
}

// ── render ─────────────────────────────────────────────────────────────────

export function varName(path: string): string {
  return "--" + path.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function renderValue(
  $type: string,
  value: unknown,
  knownVars: Set<string>,
  warn: (m: string) => void = () => {},
  ctx = "",
): string {
  if (value === null || value === undefined) {
    warn(`null/undefined value at ${ctx}`);
    return "initial";
  }
  if (typeof value === "string") {
    const ref = parseRef(value);
    if (ref !== null) {
      const name = varName(ref);
      if (!knownVars.has(name)) warn(`unknown reference {${ref}} at ${ctx}`);
      return `var(${name})`;
    }
    return renderString($type, value);
  }
  if (typeof value === "number") return renderNumber($type, value);
  if (typeof value === "boolean") return String(value);
  return String(value);
}

function parseRef(s: string): string | null {
  if (s.length >= 2 && s.startsWith("{") && s.endsWith("}")) return s.slice(1, -1);
  return null;
}

function renderString($type: string, value: string): string {
  if ($type === "color") return value; // hex (incl. #rrggbbaa) — emit verbatim
  // Bare CSS ident (e.g. Inter, Regular, Medium) passes through; anything with
  // spaces or punctuation (e.g. "pt serif") gets quoted for valid CSS.
  if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) return value;
  return JSON.stringify(value);
}

function renderNumber($type: string, value: number): string {
  const n = fmtNumber(value);
  if ($type === "fontWeight" || $type === "number") return n;
  return `${n}px`;
}

function fmtNumber(n: number): string {
  // Strip float noise from Figma (e.g. 0.10000000149011612 → 0.1).
  return String(Number(n.toFixed(4)));
}

// ── diagnostics ──────────────────────────────────────────────────────────

/**
 * Reference cycles are inert under pure var() passthrough (CSS just resolves
 * them to invalid), so we warn rather than abort. Walks the default-value
 * reference graph only — the common case.
 */
function detectCycles(nodes: TokenNode[], warn: (m: string) => void): void {
  const graph = new Map<string, string[]>();
  for (const node of nodes) {
    const name = varName(node.path);
    const edges: string[] = [];
    if (typeof node.value === "string") {
      const ref = parseRef(node.value);
      if (ref) edges.push(varName(ref));
    }
    graph.set(name, edges);
  }

  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  const visit = (v: string): boolean => {
    color.set(v, GREY);
    stack.push(v);
    for (const next of graph.get(v) ?? []) {
      if (!graph.has(next)) continue; // unknown ref handled elsewhere
      const c = color.get(next) ?? WHITE;
      if (c === GREY) {
        const cycle = stack.slice(stack.indexOf(next)).concat(next).join(" → ");
        warn(`reference cycle: ${cycle}`);
        return true;
      }
      if (c === WHITE && visit(next)) return true;
    }
    stack.pop();
    color.set(v, BLACK);
    return false;
  };

  for (const v of graph.keys()) {
    if ((color.get(v) ?? WHITE) === WHITE && visit(v)) return; // one warning is enough
  }
}

// ── stringify ────────────────────────────────────────────────────────────

function stringify(rootDecls: Map<string, string>, blocks: Block[]): string {
  const out: string[] = ["/* Generated by tokens-sync — do not edit. Source: DTCG token tree. */", ""];

  out.push(renderBlock(":root", rootDecls));

  blocks.sort((a, b) => a.phase - b.phase || a.selector.localeCompare(b.selector));
  for (const block of blocks) {
    out.push("");
    out.push(renderBlock(block.selector, block.decls));
  }

  return out.join("\n") + "\n";
}

function renderBlock(selector: string, decls: Map<string, string>): string {
  const lines = [...decls.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, value]) => `  ${name}: ${value};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

function slugOf(topKey: string): string {
  return topKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
