import type { Command } from "commander";
import { withClient } from "../context.js";
import { loadConfig } from "../config.js";
import { isJsonOutput, json, table } from "../format.js";
import { pickFirst, stringify } from "../utils.js";

export function registerWhoamiCommand(program: Command): void {
  program
    .command("whoami")
    .description("Show current session info")
    .action(async () => {
      await withClient(async (client) => {
        const config = await loadConfig();
        if (!config) {
          return;
        }

        const health = await client.get<unknown>("/health");
        const payload = {
          endpoint: config.endpoint,
          provider: stringify(pickFirst(health, ["provider", "providerName", "signingProvider"])),
          chains: stringify(pickFirst(health, ["chains", "supportedChains"])),
          version: stringify(pickFirst(health, ["version", "serviceVersion"])),
        };

        if (isJsonOutput()) {
          json(payload);
          return;
        }

        table(
          ["Field", "Value"],
          [
            ["Endpoint", payload.endpoint],
            ["Provider", payload.provider],
            ["Chains", payload.chains],
            ["Version", payload.version],
          ],
        );
      });
    });
}
