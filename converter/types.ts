export type FigmaVariableType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";

export interface FigmaModeValueLiteral {
  kind: "literal";
  value: string | number | boolean | { r: number; g: number; b: number; a: number };
}

export interface FigmaModeValueAlias {
  kind: "alias";
  variableId: string;
}

export type FigmaModeValue = FigmaModeValueLiteral | FigmaModeValueAlias;

export type FigmaScope =
  | "ALL_SCOPES"
  | "ALL_FILLS" | "FRAME_FILL" | "SHAPE_FILL" | "TEXT_FILL" | "STROKE_COLOR"
  | "EFFECT_COLOR"
  | "STROKE_FLOAT" | "OPACITY" | "EFFECT_FLOAT"
  | "CORNER_RADIUS" | "WIDTH_HEIGHT" | "GAP"
  | "FONT_FAMILY" | "FONT_STYLE" | "FONT_WEIGHT" | "FONT_SIZE"
  | "LINE_HEIGHT" | "LETTER_SPACING" | "PARAGRAPH_SPACING" | "PARAGRAPH_INDENT"
  | "FONT_VARIATIONS"
  | "TEXT_CONTENT"
  | (string & {});

export interface FigmaVariable {
  id: string;
  name: string;
  description?: string;
  collectionId: string;
  type: FigmaVariableType;
  scopes: FigmaScope[];
  valuesByMode: Record<string, FigmaModeValue>;
}

export interface FigmaCollection {
  id: string;
  name: string;
  modes: { id: string; name: string }[];
  defaultModeId: string;
}

export interface FigmaVarsExport {
  schemaVersion?: number;
  fileKey: string;
  collections: FigmaCollection[];
  variables: FigmaVariable[];
}

export interface DtcgFile {
  path: string;
  content: Record<string, unknown>;
}

// ── CSS emit stage ────────────────────────────────────────────────────────

export type SelectorStrategy = "static" | "theme" | "platform" | "component";

/**
 * One DTCG leaf, flattened. `path` is the dotted address including the
 * collection slug as its first segment (e.g. "color.blue.light.6"). `value`
 * is the default-mode value (literal or a "{ref}" string). `modes`, when
 * present, maps every mode name to its value (default mode included).
 */
export interface TokenNode {
  path: string;
  slug: string;
  $type: string;
  value: unknown;
  modes?: Record<string, unknown>;
}

/** Per-collection override of the convention-based selector classification. */
export interface CssModeOverride {
  strategy?: SelectorStrategy;
  attr?: string;
  default?: string;
}

export interface CssEmitOptions {
  /** $extensions key holding multi-mode values. Defaults to "default.modes". */
  themeExtension?: string;
  /** Per-collection-slug escape hatch over the convention. */
  cssModes?: Record<string, CssModeOverride>;
  /** Sink for non-fatal diagnostics. Defaults to a no-op (keeps emit pure). */
  warn?: (message: string) => void;
}
