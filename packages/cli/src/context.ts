import type { Command } from "commander";
import { ApiClient, CliError } from "./client.js";
import { loadConfig, type Config } from "./config.js";
import * as output from "./format.js";

export async function withClient(fn: (client: ApiClient) => Promise<void>): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    output.error("Not logged in. Run `agentpay login` first.");
    process.exitCode = 1;
    return;
  }

  const client = new ApiClient(config.endpoint, config.adminKey);

  try {
    await fn(client);
  } catch (err) {
    handleClientError(config, err);
  }
}

export function handleClientError(config: Config, err: unknown): void {
  if (err instanceof CliError) {
    output.error(err.message);
    process.exitCode = 1;
    return;
  }

  if (err instanceof Error) {
    if (err.name === "AbortError" || err instanceof TypeError) {
      output.error(`Cannot reach ${config.endpoint}. Is the service running?`);
      process.exitCode = 1;
      return;
    }
    output.error(err.message);
    process.exitCode = 1;
    return;
  }

  output.error(`Cannot reach ${config.endpoint}. Is the service running?`);
  process.exitCode = 1;
}

export function syncJsonOption(command: Command): void {
  const opts = command.optsWithGlobals() as { json?: boolean };
  output.setJsonOutput(Boolean(opts.json));
}
