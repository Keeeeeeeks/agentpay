import type { Command } from "commander";
import { withClient } from "../context.js";
import { isJsonOutput, json, success, table } from "../format.js";
import { extractList, pickFirst, stringify } from "../utils.js";

interface RejectOptions {
  reason?: string;
}

export function registerApprovalsCommand(program: Command): void {
  const approvals = program.command("approvals").description("Manage pending approvals");

  approvals
    .command("list")
    .description("List approvals")
    .action(async () => {
      await withClient(async (client) => {
        const result = await client.get<unknown>("/api/approvals");
        if (isJsonOutput()) {
          json(result);
          return;
        }
        const list = extractList(result);
        const rows = list.map((item) => [
          stringify(pickFirst(item, ["id"])),
          stringify(pickFirst(item, ["agentId", "agent"])),
          stringify(pickFirst(item, ["action", "type"])),
          stringify(pickFirst(item, ["status"])),
          stringify(pickFirst(item, ["expiresAt", "expires"])),
        ]);
        table(["ID", "Agent", "Action", "Status", "Expires"], rows);
      });
    });

  approvals
    .command("approve")
    .argument("<id>", "Approval ID")
    .description("Approve a pending action")
    .action(async (id: string) => {
      await withClient(async (client) => {
        await client.post<unknown>(`/api/approvals/${id}/approve`);
        success(`Approved ${id}`);
      });
    });

  approvals
    .command("reject")
    .argument("<id>", "Approval ID")
    .option("--reason <text>", "Rejection reason")
    .description("Reject a pending action")
    .action(async (id: string, options: RejectOptions) => {
      await withClient(async (client) => {
        const body = options.reason ? { reason: options.reason } : undefined;
        await client.post<unknown>(`/api/approvals/${id}/reject`, body);
        success(`Rejected ${id}`);
      });
    });
}
