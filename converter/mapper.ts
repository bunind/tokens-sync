import type {
  FigmaVarsExport,
  FigmaCollection,
  FigmaVariable,
  FigmaModeValue,
  FigmaScope,
  DtcgFile,
} from "./types.ts";

interface MapperContext {
  collectionsById: Map<string, FigmaCollection>;
  variablesById: Map<string, FigmaVariable>;
  themeExtension: string;
}

export const DEFAULT_THEME_EXTENSION = "default.modes";

export function mapToDtcg(
  figmaExport: FigmaVarsExport,
  themeExtension: string = DEFAULT_THEME_EXTENSION,
): DtcgFile[] {
  const ctx: MapperContext = {
    collectionsById: new Map(figmaExport.collections.map((c) => [c.id, c])),
    variablesById: new Map(figmaExport.variables.map((v) => [v.id, v])),
    themeExtension,
  };

  const byCollection = new Map<string, FigmaVariable[]>();
  for (const v of figmaExport.variables) {
    const arr = byCollection.get(v.collectionId) ?? [];
    arr.push(v);
    byCollection.set(v.collectionId, arr);
  }

  const files: DtcgFile[] = [];
  for (const collection of figmaExport.collections) {
    const vars = byCollection.get(collection.id) ?? [];
    if (vars.length === 0) continue;

    const slug = slugify(collection.name);
    if (!slug) continue;

    const tree: Record<string, unknown> = {};
    for (const v of vars) {
      const segments = parseVariablePath(v.name, slug);
      if (segments.length === 0) continue;
      const node = buildLeaf(v, collection, ctx);
      setAt(tree, segments, node);
    }

    files.push({
      path: `${slug}/${slug}.tokens.json`,
      content: { [slug]: tree },
    });
  }

  return files;
}

function buildLeaf(
  variable: FigmaVariable,
  collection: FigmaCollection,
  ctx: MapperContext,
): Record<string, unknown> {
  const $type = inferDtcgType(variable, ctx);
  const defaultValue = encodeValue(variable.valuesByMode[collection.defaultModeId], ctx);

  const leaf: Record<string, unknown> = { $type, $value: defaultValue };

  if (variable.description && variable.description.trim() !== "") {
    leaf.$description = variable.description;
  }

  if (collection.modes.length > 1) {
    const modesObj: Record<string, unknown> = {};
    for (const mode of collection.modes) {
      const v = variable.valuesByMode[mode.id];
      if (v === undefined) continue;
      modesObj[normalizeModeName(mode.name)] = encodeValue(v, ctx);
    }
    leaf.$extensions = { [ctx.themeExtension]: modesObj };
  }

  return leaf;
}

function encodeValue(value: FigmaModeValue | undefined, ctx: MapperContext): unknown {
  if (value === undefined) return null;
  if (value.kind === "alias") {
    const target = ctx.variablesById.get(value.variableId);
    if (!target) return `{unresolved:${value.variableId}}`;
    return `{${aliasPath(target, ctx)}}`;
  }
  const raw = value.value;
  if (typeof raw === "object" && raw !== null && "r" in raw) {
    return rgbaToHex(raw);
  }
  return raw;
}

function aliasPath(target: FigmaVariable, ctx: MapperContext): string {
  const collection = ctx.collectionsById.get(target.collectionId);
  const collectionSlug = collection ? slugify(collection.name) : "unknown";
  const varSegments = parseVariablePath(target.name, collectionSlug);
  return [collectionSlug, ...varSegments].join(".");
}

function parseVariablePath(name: string, collectionSlug: string): string[] {
  const segments = name.split("/").map((s) => s.trim()).filter(Boolean);
  if (segments.length > 1 && slugify(segments[0]!) === collectionSlug) {
    return segments.slice(1);
  }
  return segments;
}

function inferDtcgType(
  variable: FigmaVariable,
  ctx: MapperContext,
  seen: Set<string> = new Set(),
): string {
  if (variable.type === "COLOR") return "color";
  if (variable.type === "BOOLEAN") return "boolean";

  const fromScope = inferFromScope(variable);
  if (fromScope) return fromScope;

  if (!seen.has(variable.id)) {
    seen.add(variable.id);
    const target = followAlias(variable, ctx);
    if (target) return inferDtcgType(target, ctx, seen);
  }

  return variable.type === "STRING" ? "string" : "dimension";
}

function inferFromScope(variable: FigmaVariable): string | null {
  if (variable.type === "STRING") {
    if (hasScope(variable.scopes, "FONT_FAMILY")) return "fontFamily";
    if (hasScope(variable.scopes, "FONT_STYLE")) return "fontStyle";
    return null;
  }
  if (variable.type !== "FLOAT") return null;
  if (hasScope(variable.scopes, "FONT_WEIGHT")) return "fontWeight";
  if (hasScope(variable.scopes, "LINE_HEIGHT")) return "dimension";
  if (hasScope(variable.scopes, "LETTER_SPACING")) return "dimension";
  if (hasScope(variable.scopes, "FONT_SIZE")) return "dimension";
  if (hasScope(variable.scopes, "OPACITY")) return "number";
  return null;
}

function followAlias(variable: FigmaVariable, ctx: MapperContext): FigmaVariable | null {
  const collection = ctx.collectionsById.get(variable.collectionId);
  if (!collection) return null;
  const defaultValue = variable.valuesByMode[collection.defaultModeId];
  if (!defaultValue || defaultValue.kind !== "alias") return null;
  return ctx.variablesById.get(defaultValue.variableId) ?? null;
}

function hasScope(scopes: FigmaScope[] | undefined, target: FigmaScope): boolean {
  if (!scopes) return false;
  return scopes.includes(target);
}

function rgbaToHex(c: { r: number; g: number; b: number; a: number }): string {
  const to2 = (n: number) =>
    Math.round(Math.max(0, Math.min(1, n)) * 255)
      .toString(16)
      .padStart(2, "0");
  const hex = `#${to2(c.r)}${to2(c.g)}${to2(c.b)}`;
  return c.a < 1 ? `${hex}${to2(c.a)}` : hex;
}

function setAt(tree: Record<string, unknown>, path: string[], leaf: Record<string, unknown>) {
  let node: Record<string, unknown> = tree;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (!(key in node) || typeof node[key] !== "object" || node[key] === null) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[path[path.length - 1]!] = leaf;
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeModeName(name: string): string {
  return name.toLowerCase();
}
