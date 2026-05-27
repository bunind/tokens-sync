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
