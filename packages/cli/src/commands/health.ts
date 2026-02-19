import type { Command } from "commander";
import { withClient } from "../context.js";
import { isJsonOutput, json, table } from "../format.js";
import { pickFirst, stringify } from "../utils.js";

export function registerHealthCommand(program: Command): void {
  program
    .command("health")
    .description("Check service health")
    .action(async () => {
      await withClient(async (client) => {
        const health = await client.get<unknown>("/health");
        const payload = {
          status: stringify(pickFirst(health, ["status", "ok"])),
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
            ["Status", payload.status],
            ["Provider", payload.provider],
            ["Chains", payload.chains],
            ["Version", payload.version],
          ],
        );
      });
    });
}
