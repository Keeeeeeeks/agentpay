import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Config {
  endpoint: string;
  adminKey: string;
}

const CONFIG_PATH = join(homedir(), ".agentpay", "config.json");

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export async function loadConfig(): Promise<Config | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isConfig(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function clearConfig(): Promise<void> {
  await rm(CONFIG_PATH, { force: true });
}

function isConfig(value: unknown): value is Config {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.endpoint === "string" && typeof record.adminKey === "string";
}
