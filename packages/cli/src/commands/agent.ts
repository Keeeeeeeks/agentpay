import type { Command } from "commander";
import { withClient } from "../context.js";
import { isJsonOutput, json, success, table } from "../format.js";
import { extractList, parseCsv, pickFirst, stringify, toFlatRows } from "../utils.js";

interface AgentCreateOptions {
  preset?: string;
  chains?: string;
}

export function registerAgentCommand(program: Command): void {
  const agent = program.command("agent").description("Manage agents");

  agent
    .command("create")
    .requiredOption("--name <name>", "Agent name")
    .option("--preset <preset>", "Policy preset (safe|normal|degen)")
    .option("--chains <chains>", "Comma-separated chain list")
    .description("Create a new agent")
    .action(async (options: AgentCreateOptions & { name: string }) => {
      await withClient(async (client) => {
        const body: Record<string, unknown> = { name: options.name };
        if (options.preset) {
          body.preset = options.preset;
        }
        const chains = parseCsv(options.chains);
        if (chains) {
          body.chains = chains;
        }

        const result = await client.post<unknown>("/api/agents", body);
        const payload = {
          id: stringify(pickFirst(result, ["id", "agentId"])),
          walletAddress: stringify(
            pickFirst(result, ["walletAddress", "address", "wallet", "wallet.address"]),
          ),
          policyPreset: stringify(pickFirst(result, ["policyPreset", "preset", "policy"])),
        };

        if (isJsonOutput()) {
          json(result);
          return;
        }

        table(
          ["Field", "Value"],
          [
            ["Agent ID", payload.id],
            ["Wallet", payload.walletAddress],
            ["Policy", payload.policyPreset],
          ],
        );
      });
    });

  agent
    .command("list")
    .description("List all agents")
    .action(async () => {
      await withClient(async (client) => {
        const result = await client.get<unknown>("/api/agents");
        if (isJsonOutput()) {
          json(result);
          return;
        }

        const list = extractList(result);
        const rows = list.map((item) => [
          stringify(pickFirst(item, ["id", "agentId"])),
          stringify(pickFirst(item, ["name"])),
          stringify(pickFirst(item, ["status"])),
          stringify(pickFirst(item, ["createdAt", "created_at"])),
        ]);
        table(["ID", "Name", "Status", "Created"], rows);
      });
    });

  agent
    .command("info")
    .argument("<id>", "Agent ID")
    .description("Show details for one agent")
    .action(async (id: string) => {
      await withClient(async (client) => {
        const result = await client.get<unknown>(`/api/agents/${id}`);
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

  agent
    .command("revoke")
    .argument("<id>", "Agent ID")
    .description("Revoke an agent")
    .action(async (id: string) => {
      await withClient(async (client) => {
        await client.del<unknown>(`/api/agents/${id}`);
        success(`Revoked agent ${id}`);
      });
    });
}
