import type { Command } from "commander";
import { withClient } from "../context.js";
import { isJsonOutput, json, success, table, warn } from "../format.js";
import { extractList, parseNumber, pickFirst, stringify, toFlatRows } from "../utils.js";

interface PolicySetOptions {
  preset?: string;
  dailyLimit?: string;
  maxTx?: string;
  bridgeMode?: string;
  memecoinMode?: string;
  memecoinTxLimit?: string;
}

export function registerPolicyCommand(program: Command): void {
  const policy = program.command("policy").description("Manage agent policy");

  policy
    .command("show")
    .argument("<agent-id>", "Agent ID")
    .description("Show an agent policy")
    .action(async (agentId: string) => {
      await withClient(async (client) => {
        const result = await client.get<unknown>(`/api/agents/${agentId}/policy`);
        if (isJsonOutput()) {
          json(result);
          return;
        }
        table(
          ["Field", "Value"],
          toFlatRows(result).map(([key, value]) => [key, value]),
        );
      });
    });

  policy
    .command("set")
    .argument("<agent-id>", "Agent ID")
    .option("--preset <name>", "Preset policy")
    .option("--daily-limit <usd>", "Daily USD limit")
    .option("--max-tx <usd>", "Max tx USD")
    .option("--bridge-mode <mode>", "Bridge mode")
    .option("--memecoin-mode <mode>", "Memecoin mode")
    .option("--memecoin-tx-limit <usd>", "Memecoin tx limit")
    .description("Update policy")
    .action(async (agentId: string, options: PolicySetOptions) => {
      await withClient(async (client) => {
        const body: Record<string, unknown> = {};

        if (options.preset) {
          body.preset = options.preset;
        }
        const dailyLimit = parseNumber(options.dailyLimit);
        if (dailyLimit !== undefined) {
          body.dailyLimit = dailyLimit;
        }
        const maxTx = parseNumber(options.maxTx);
        if (maxTx !== undefined) {
          body.maxTx = maxTx;
        }
        if (options.bridgeMode) {
          body.bridgeMode = options.bridgeMode;
        }
        if (options.memecoinMode) {
          body.memecoinMode = options.memecoinMode;
        }
        const memecoinTxLimit = parseNumber(options.memecoinTxLimit);
        if (memecoinTxLimit !== undefined) {
          body.memecoinTxLimit = memecoinTxLimit;
        }

        if (Object.keys(body).length === 0) {
          warn("No policy fields were provided.");
          return;
        }

        const result = await client.put<unknown>(`/api/agents/${agentId}/policy`, body);

        if (isJsonOutput()) {
          json(result);
          return;
        }

        success(`Updated policy for ${agentId}`);
        table(
          ["Field", "Value"],
          toFlatRows(result).map(([key, value]) => [key, value]),
        );
      });
    });

  policy
    .command("presets")
    .description("List policy presets")
    .action(async () => {
      await withClient(async (client) => {
        const result = await client.get<unknown>("/api/policies/presets");
        if (isJsonOutput()) {
          json(result);
          return;
        }

        const list = extractList(result);
        const rows = list.map((item) => [
          stringify(pickFirst(item, ["name", "preset"])),
          stringify(pickFirst(item, ["dailyLimit", "dailyLimitUsd"])),
          stringify(pickFirst(item, ["maxTx", "maxTxUsd"])),
          stringify(pickFirst(item, ["bridgeMode"])),
          stringify(pickFirst(item, ["memecoinMode"])),
        ]);

        table(["Preset", "Daily Limit", "Max Tx", "Bridge", "Memecoin"], rows);
      });
    });
}
