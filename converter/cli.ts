#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve, dirname, isAbsolute } from "node:path";
import { mapToDtcg, DEFAULT_THEME_EXTENSION } from "./mapper.ts";
import { writeFiles } from "./writer.ts";
import { loadConfig } from "./config.ts";
import { resolveInputPath } from "./input.ts";
import { runInit } from "./init.ts";
import { loadDtcg } from "./dtcg-load.ts";
import { emitCss } from "./css.ts";
import { writeText } from "./writeText.ts";
import type { FigmaVarsExport } from "./types.ts";

const DEFAULT_PRESERVE = ["manifest.json", "resolver/**"];

const USAGE = `Usage:
  tokens-sync <file-key-or-input-path> [options]
  tokens-sync css [options]
  tokens-sync --init

Arguments:
  <file-key-or-input-path>   A token suffix (auto-discovers the newest
                             ~/Downloads/tokens-<suffix>.json) OR an
                             absolute/relative path to a raw JSON file.

Options:
  --input <path>             Explicit raw JSON path. Overrides positional.
  --config <path>            Explicit config file. Skips upward discovery.
  --out <path>               Output folder. Overrides config and input dir.
  --theme-extension <key>    $extensions key for multi-mode values.
                             Defaults to "default.modes".
  --dry-run                  Plan writes without touching the filesystem.
  --init                     Scaffold tokens-sync.config.json in cwd.
  -h, --help                 Show this message.

css subcommand (DTCG tree → one browser-ready tokens.css):
  --tokens <dir>             DTCG root to read. Defaults to cwd.
  --out <path>               Output CSS file. Defaults to config.cssOut,
                             else <tokens>/../dist/tokens.css.
  --config <path>            Explicit config file (reused as-is).
  --theme-extension <key>    $extensions key for multi-mode values.
  --dry-run                  Plan the write without touching the filesystem.
`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: { type: "string" },
      config: { type: "string" },
      out: { type: "string" },
      tokens: { type: "string" },
      "theme-extension": { type: "string" },
      "dry-run": { type: "boolean" },
      init: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const cwd = process.cwd();

  if (positionals[0] === "css") {
    return runCss(values, cwd);
  }

  if (values.init) {
    const result = await runInit(cwd);
    if (result.kind === "existing") {
      process.stderr.write(`Config already exists: ${result.path}\n`);
      return 1;
    }
    process.stdout.write(`Wrote ${result.path}\n`);
    return 0;
  }

  let inputPath: string;
  try {
    inputPath = await resolveInputPath({
      positional: positionals[0],
      inputFlag: values.input,
      cwd,
    });
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n\n`);
    process.stdout.write(USAGE);
    return 1;
  }

  let raw: string;
  try {
    raw = await readFile(inputPath, "utf8");
  } catch (err) {
    process.stderr.write(
      `Error: cannot read input file at ${inputPath}\n  ${(err as Error).message}\n`,
    );
    return 1;
  }

  let figmaExport: FigmaVarsExport;
  try {
    figmaExport = JSON.parse(raw) as FigmaVarsExport;
  } catch (err) {
    process.stderr.write(`Error: input is not valid JSON\n  ${(err as Error).message}\n`);
    return 1;
  }

  if (
    !figmaExport ||
    !Array.isArray(figmaExport.collections) ||
    !Array.isArray(figmaExport.variables)
  ) {
    process.stderr.write(
      `Error: input does not look like a Figma raw variables export ` +
        `(missing "collections" or "variables" array).\n`,
    );
    return 1;
  }

  let configResult;
  try {
    configResult = await loadConfig(values.config, cwd);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
  const { config, configPath } = configResult;

  const outDir = pickOutDir({
    flag: values.out,
    config: config.out,
    fallback: dirname(inputPath),
    configPath,
    cwd,
  });

  const themeExtension =
    values["theme-extension"] ?? config.themeExtension ?? DEFAULT_THEME_EXTENSION;
  const preserve = config.preserve ?? DEFAULT_PRESERVE;
  const dryRun = values["dry-run"] === true;

  const files = mapToDtcg(figmaExport, themeExtension);
  if (files.length === 0) {
    process.stderr.write(`Error: no convertible collections found in the export.\n`);
    return 1;
  }

  const plan = await writeFiles(files, { outDir, preserve, dryRun });

  const verb = dryRun ? "Would write" : "Wrote";
  const total = plan.written.length;
  process.stdout.write(
    `${verb} ${total} file${total === 1 ? "" : "s"} → ${outDir}` +
      (configPath ? `\nConfig: ${configPath}` : "") +
      "\n",
  );
  for (const p of plan.written) process.stdout.write(`  ${dryRun ? "+" : "✓"} ${p}\n`);
  for (const p of plan.unchanged) process.stdout.write(`  = ${p} (unchanged)\n`);
  for (const p of plan.preserved) process.stdout.write(`  - ${p} (preserved, skipped)\n`);
  return 0;
}

interface CssCliValues {
  tokens?: string;
  out?: string;
  config?: string;
  "theme-extension"?: string;
  "dry-run"?: boolean;
}

async function runCss(values: CssCliValues, cwd: string): Promise<number> {
  let configResult;
  try {
    configResult = await loadConfig(values.config, cwd);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
  const { config, configPath } = configResult;
  const configBase = configPath ? dirname(configPath) : cwd;

  const tokensDir = values.tokens ? absolutize(values.tokens, cwd) : cwd;

  let outPath: string;
  if (values.out) {
    outPath = absolutize(values.out, cwd);
  } else if (config.cssOut) {
    outPath = absolutize(config.cssOut, configBase);
  } else {
    outPath = resolve(tokensDir, "../dist/tokens.css");
  }

  const themeExtension =
    values["theme-extension"] ?? config.themeExtension ?? DEFAULT_THEME_EXTENSION;
  const dryRun = values["dry-run"] === true;

  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);

  let files;
  try {
    files = await loadDtcg(tokensDir, { warn });
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
  if (files.length === 0) {
    process.stderr.write(`Error: no *.tokens.json found under ${tokensDir}\n`);
    return 1;
  }

  const css = emitCss(files, { themeExtension, cssModes: config.cssModes, warn });

  let plan;
  try {
    plan = await writeText(outPath, css, { dryRun });
  } catch (err) {
    process.stderr.write(`Error: cannot write ${outPath}\n  ${(err as Error).message}\n`);
    return 1;
  }

  for (const w of warnings) process.stderr.write(`[tokens-sync css] WARN: ${w}\n`);

  if (plan.unchanged) {
    process.stdout.write(`= ${outPath} (unchanged)\n`);
  } else {
    const verb = dryRun ? "Would write" : "Wrote";
    process.stdout.write(`${verb} ${outPath}\n`);
  }
  if (configPath) process.stdout.write(`Config: ${configPath}\n`);
  return 0;
}

function absolutize(p: string, base: string): string {
  return isAbsolute(p) ? p : resolve(base, p);
}

function pickOutDir(opts: {
  flag: string | undefined;
  config: string | undefined;
  fallback: string;
  configPath: string | null;
  cwd: string;
}): string {
  if (opts.flag) {
    return isAbsolute(opts.flag) ? opts.flag : resolve(opts.cwd, opts.flag);
  }
  if (opts.config) {
    const base = opts.configPath ? dirname(opts.configPath) : opts.cwd;
    return isAbsolute(opts.config) ? opts.config : resolve(base, opts.config);
  }
  return opts.fallback;
}

const exitCode = await main();
process.exit(exitCode);
