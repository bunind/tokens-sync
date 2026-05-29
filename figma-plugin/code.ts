/// <reference types="@figma/plugin-typings" />

const SCHEMA_VERSION = 1;

const KNOWN_VARIABLE_TYPES: ReadonlySet<string> = new Set([
  "COLOR",
  "FLOAT",
  "STRING",
  "BOOLEAN",
]);

type FigmaVariableType =
  | "COLOR"
  | "FLOAT"
  | "STRING"
  | "BOOLEAN"
  | (string & {});

interface FigmaModeValueLiteral {
  kind: "literal";
  value: string | number | boolean | { r: number; g: number; b: number; a: number };
}

interface FigmaModeValueAlias {
  kind: "alias";
  variableId: string;
}

type FigmaModeValue = FigmaModeValueLiteral | FigmaModeValueAlias;

interface FigmaVariable {
  id: string;
  name: string;
  description?: string;
  collectionId: string;
  type: FigmaVariableType;
  scopes: string[];
  valuesByMode: Record<string, FigmaModeValue>;
}

interface FigmaCollection {
  id: string;
  name: string;
  modes: { id: string; name: string }[];
  defaultModeId: string;
}

interface FigmaVarsExport {
  schemaVersion: number;
  collections: FigmaCollection[];
  variables: FigmaVariable[];
}

main();

async function main(): Promise<void> {
  try {
    const payload = await buildExport();

    if (payload.variables.length === 0) {
      figma.closePlugin("Add variables or open a different Figma file.");
      return;
    }

    const variables = payload.variables.length;
    const collections = payload.collections.length;

    figma.showUI(__html__, { visible: false });
    figma.ui.postMessage({
      type: "download",
      filename: `tokens-${isoDate()}.json`,
      json: JSON.stringify(payload, null, 2),
    });

    figma.ui.onmessage = () => {
      figma.closePlugin(
        `Exported ${variables} ${plural(variables, "variable")} from ${collections} ${plural(collections, "collection")}`,
      );
    };
  } catch (err) {
    console.error("[Raw Tokens Exporter] export failed", err);
    figma.closePlugin("Couldn't export variables. Please try again, or contact support if the issue persists.");
  }
}

async function buildExport(): Promise<FigmaVarsExport> {
  const [collections, variables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);

  return {
    schemaVersion: SCHEMA_VERSION,
    collections: collections.map(serializeCollection),
    variables: variables.map(serializeVariable),
  };
}

function serializeCollection(c: VariableCollection): FigmaCollection {
  return {
    id: c.id,
    name: c.name,
    modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })),
    defaultModeId: c.defaultModeId,
  };
}

function serializeVariable(v: Variable): FigmaVariable {
  const type: string = v.resolvedType;
  if (!KNOWN_VARIABLE_TYPES.has(type)) {
    console.warn(`[Raw Tokens Exporter] unknown variable type "${type}" on "${v.name}"`);
  }
  const valuesByMode: Record<string, FigmaModeValue> = {};
  for (const [modeId, raw] of Object.entries(v.valuesByMode)) {
    valuesByMode[modeId] = serializeValue(raw);
  }
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    collectionId: v.variableCollectionId,
    type,
    scopes: v.scopes,
    valuesByMode,
  };
}

function serializeValue(value: VariableValue): FigmaModeValue {
  if (isAlias(value)) return { kind: "alias", variableId: value.id };
  if (typeof value === "object" && value !== null && "r" in value) {
    const rgba = "a" in value ? value : { r: value.r, g: value.g, b: value.b, a: 1 };
    return { kind: "literal", value: rgba };
  }
  return { kind: "literal", value };
}

function isAlias(value: VariableValue): value is VariableAlias {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type: string }).type === "VARIABLE_ALIAS"
  );
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function isoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
