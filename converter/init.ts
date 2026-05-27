import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CONFIG_FILENAME } from "./config.ts";

const TEMPLATE = {
  out: "./tokens",
  preserve: ["manifest.json", "resolver/**"],
  themeExtension: "default.modes",
};

export type InitResult =
  | { kind: "created"; path: string }
  | { kind: "existing"; path: string };

export async function runInit(cwd: string): Promise<InitResult> {
  const target = resolve(cwd, CONFIG_FILENAME);
  if (existsSync(target)) return { kind: "existing", path: target };
  await writeFile(target, JSON.stringify(TEMPLATE, null, 2) + "\n", "utf8");
  return { kind: "created", path: target };
}
