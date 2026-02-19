import type { Command } from "commander";
import { withClient } from "../context.js";
import { isJsonOutput, json, table } from "../format.js";
import { extractList, pickFirst, stringify } from "../utils.js";

interface AuditOptions {
  limit?: string;
}

export function registerAuditCommand(program: Command): void {
  program
    .command("audit")
    .argument("<agent-id>", "Agent ID")
    .option("--limit <n>", "Max rows to return")
    .description("List audit events for an agent")
    .action(async (agentId: string, options: AuditOptions) => {
      await withClient(async (client) => {
        const params = new URLSearchParams();
        if (options.limit) {
          params.set("limit", options.limit);
        }
        const query = params.toString();
        const path = query.length > 0 ? `/api/audit/${agentId}?${query}` : `/api/audit/${agentId}`;
        const result = await client.get<unknown>(path);

        if (isJsonOutput()) {
          json(result);
          return;
        }

        const list = extractList(result);
        const rows = list.map((item) => [
          stringify(pickFirst(item, ["time", "createdAt", "timestamp"])),
          stringify(pickFirst(item, ["action", "event"])),
          stringify(pickFirst(item, ["token", "tokenJti", "jti"])),
          stringify(pickFirst(item, ["details", "detail", "metadata"])),
        ]);
        table(["Time", "Action", "Token", "Details"], rows);
      });
    });
}
