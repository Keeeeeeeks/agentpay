import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as outputStream } from "node:process";
import type { Command } from "commander";
import { ApiClient, CliError } from "../client.js";
import { saveConfig } from "../config.js";
import { error, success } from "../format.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Authenticate with AgentPay service")
    .action(async () => {
      const rl = createInterface({ input, output: outputStream });
      let endpointForError = "(unknown endpoint)";
      try {
        const endpointInput = await rl.question("Endpoint URL: ");
        const adminKeyInput = await rl.question("Admin key: ");

        const endpoint = endpointInput.trim();
        const adminKey = adminKeyInput.trim();
        endpointForError = endpoint;

        if (endpoint.length === 0 || adminKey.length === 0) {
          throw new Error("Endpoint and admin key are required.");
        }

        const client = new ApiClient(endpoint, adminKey);
        await client.get<unknown>("/health");

        await saveConfig({ endpoint, adminKey });
        success(`Logged in to ${endpoint}`);
      } catch (err) {
        if (err instanceof CliError) {
          error(err.message);
        } else if (err instanceof Error && err.message === "Endpoint and admin key are required.") {
          error(err.message);
        } else {
          error(`Cannot reach ${endpointForError}. Is the service running?`);
        }
        process.exitCode = 1;
      } finally {
        rl.close();
      }
    });
}
