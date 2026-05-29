import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, isAbsolute, parse } from "node:path";
import type { CssModeOverride, SelectorStrategy } from "./types.ts";

const CSS_STRATEGIES: SelectorStrategy[] = ["static", "theme", "platform", "component"];

export interface TokensSyncConfig {
  out?: string;
  preserve?: string[];
  themeExtension?: string;
  cssOut?: string;
  cssModes?: Record<string, CssModeOverride>;
}

export interface ResolvedConfig {
  config: TokensSyncConfig;
  configPath: string | null;
}

export const CONFIG_FILENAME = "tokens-sync.config.json";

export async function loadConfig(
  explicitPath: string | undefined,
  cwd: string,
): Promise<ResolvedConfig> {
  const path = explicitPath
    ? isAbsolute(explicitPath) ? explicitPath : resolve(cwd, explicitPath)
    : findConfigUp(cwd);

  if (!path) return { config: {}, configPath: null };

  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }

  const raw = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${(err as Error).message}`);
  }
  return { config: validateConfig(parsed, path), configPath: path };
}

function findConfigUp(startDir: string): string | null {
  let dir = resolve(startDir);
  const root = parse(dir).root;
  // bounded walk; never crosses the filesystem root
  while (true) {
    const candidate = resolve(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    if (dir === root) return null;
    dir = dirname(dir);
  }
}

function validateConfig(input: unknown, path: string): TokensSyncConfig {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${path} must be a JSON object`);
  }
  const obj = input as Record<string, unknown>;
  const out: TokensSyncConfig = {};

  if ("out" in obj) {
    if (typeof obj.out !== "string" || obj.out.length === 0) {
      throw new Error(`${path}: "out" must be a non-empty string`);
    }
    out.out = obj.out;
  }
  if ("preserve" in obj) {
    if (!Array.isArray(obj.preserve) || !obj.preserve.every((x) => typeof x === "string")) {
      throw new Error(`${path}: "preserve" must be an array of strings`);
    }
    out.preserve = obj.preserve as string[];
  }
  if ("themeExtension" in obj) {
    if (typeof obj.themeExtension !== "string" || obj.themeExtension.length === 0) {
      throw new Error(`${path}: "themeExtension" must be a non-empty string`);
    }
    out.themeExtension = obj.themeExtension;
  }
  if ("cssOut" in obj) {
    if (typeof obj.cssOut !== "string" || obj.cssOut.length === 0) {
      throw new Error(`${path}: "cssOut" must be a non-empty string`);
    }
    out.cssOut = obj.cssOut;
  }
  if ("cssModes" in obj) {
    out.cssModes = validateCssModes(obj.cssModes, path);
  }
  return out;
}

function validateCssModes(input: unknown, path: string): Record<string, CssModeOverride> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${path}: "cssModes" must be an object keyed by collection slug`);
  }
  const result: Record<string, CssModeOverride> = {};
  for (const [slug, raw] of Object.entries(input as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error(`${path}: "cssModes.${slug}" must be an object`);
    }
    const entry = raw as Record<string, unknown>;
    const override: CssModeOverride = {};
    if ("strategy" in entry) {
      if (!CSS_STRATEGIES.includes(entry.strategy as SelectorStrategy)) {
        throw new Error(
          `${path}: "cssModes.${slug}.strategy" must be one of ${CSS_STRATEGIES.join(", ")}`,
        );
      }
      override.strategy = entry.strategy as SelectorStrategy;
    }
    if ("attr" in entry) {
      if (typeof entry.attr !== "string" || entry.attr.length === 0) {
        throw new Error(`${path}: "cssModes.${slug}.attr" must be a non-empty string`);
      }
      override.attr = entry.attr;
    }
    if ("default" in entry) {
      if (typeof entry.default !== "string" || entry.default.length === 0) {
        throw new Error(`${path}: "cssModes.${slug}.default" must be a non-empty string`);
      }
      override.default = entry.default;
    }
    result[slug] = override;
  }
  return result;
}
