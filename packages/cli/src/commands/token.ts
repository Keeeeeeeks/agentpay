import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { withClient } from "../context.js";
import { isJsonOutput, json, success, table } from "../format.js";
import { extractList, parseNumber, pickFirst, stringify } from "../utils.js";

interface TokenCreateOptions {
  ttl?: string;
  export?: string;
}

export function registerTokenCommand(program: Command): void {
  const token = program.command("token").description("Manage agent tokens");

  token
    .command("create")
    .argument("<agent-id>", "Agent ID")
    .option("--ttl <seconds>", "Token TTL in seconds")
    .option("--export <filepath>", "Export token to file")
    .description("Create an agent token")
    .action(async (agentId: string, options: TokenCreateOptions) => {
      await withClient(async (client) => {
        const ttl = parseNumber(options.ttl);
        const body = ttl === undefined ? undefined : { ttl };
        const result = await client.post<unknown>(`/api/agents/${agentId}/tokens`, body);
        const tokenValue = extractToken(result);

        if (options.export) {
          await writeFile(options.export, `AGENTPAY_TOKEN=${tokenValue}\n`, "utf8");
          success(`Token exported to ${options.export}`);
        }

        if (isJsonOutput()) {
          json({ token: tokenValue });
          return;
        }

        console.log(tokenValue);
      });
    });

  token
    .command("list")
    .argument("<agent-id>", "Agent ID")
    .description("List agent tokens")
    .action(async (agentId: string) => {
      await withClient(async (client) => {
        const result = await client.get<unknown>(`/api/agents/${agentId}/tokens`);
        if (isJsonOutput()) {
          json(result);
          return;
        }
        const list = extractList(result);
        const rows = list.map((item) => [
          stringify(pickFirst(item, ["jti", "id"])),
          stringify(pickFirst(item, ["issuedAt", "createdAt", "iat"])),
          stringify(pickFirst(item, ["expiresAt", "exp"])),
          stringify(pickFirst(item, ["revoked", "revokedAt"])),
          stringify(pickFirst(item, ["uses", "useCount"])),
        ]);
        table(["JTI", "Issued", "Expires", "Revoked", "Uses"], rows);
      });
    });

  token
    .command("revoke")
    .argument("<agent-id>", "Agent ID")
    .argument("<jti>", "JWT token id")
    .description("Revoke a token")
    .action(async (agentId: string, jti: string) => {
      await withClient(async (client) => {
        await client.del<unknown>(`/api/agents/${agentId}/tokens/${jti}`);
        success(`Revoked token ${jti}`);
      });
    });
}

function extractToken(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const candidates = [record.token, record.jwt, record.accessToken];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
      }
    }
  }
  throw new Error("Token not found in response");
}
