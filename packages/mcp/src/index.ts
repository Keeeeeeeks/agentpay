import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  canTransact,
  getBalance,
  getBalances,
  getPolicy,
  getRemainingBudget,
  getTransactionStatus,
  getWallet,
  requestAllowlist,
  signTransaction,
} from "./client.js";

function asTextContent(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function asErrorContent(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "agentpay",
    version: "0.1.0",
  });

  server.registerTool("get_balances", { description: "Get wallet balances across all chains" }, async () => {
    try {
      const balances = await getBalances();
      return asTextContent(balances);
    } catch (error) {
      return asErrorContent(error);
    }
  });

  server.registerTool(
    "get_balance",
    {
      description: "Get wallet balance for a specific chain",
      inputSchema: { chainId: z.string().min(1) },
    },
    async ({ chainId }: { chainId: string }) => {
      try {
        const balance = await getBalance(chainId);
        return asTextContent(balance);
      } catch (error) {
        return asErrorContent(error);
      }
    },
  );

  server.registerTool(
    "sign_transaction",
    {
      description: "Submit a transaction for signing under current policy",
      inputSchema: {
        chainId: z.string().min(1),
        to: z.string().min(1),
        value: z.string().min(1),
        data: z.string().optional(),
        reason: z.string().min(1),
      },
    },
    async (args: { chainId: string; to: string; value: string; data?: string; reason: string }) => {
      try {
        const result = await signTransaction(args);
        return asTextContent(result);
      } catch (error) {
        return asErrorContent(error);
      }
    },
  );

  server.registerTool(
    "get_transaction_status",
    {
      description: "Check the status of a submitted transaction",
      inputSchema: { hash: z.string().min(1) },
    },
    async ({ hash }: { hash: string }) => {
      try {
        const status = await getTransactionStatus(hash);
        return asTextContent(status);
      } catch (error) {
        return asErrorContent(error);
      }
    },
  );

  server.registerTool("get_policy", { description: "Get current policy limits" }, async () => {
    try {
      const policy = await getPolicy();
      return asTextContent(policy);
    } catch (error) {
      return asErrorContent(error);
    }
  });

  server.registerTool(
    "get_remaining_budget",
    { description: "Get remaining daily and weekly budgets" },
    async () => {
    try {
      const remaining = await getRemainingBudget();
      return asTextContent(remaining);
    } catch (error) {
      return asErrorContent(error);
    }
  });

  server.registerTool(
    "can_transact",
    {
      description: "Check whether a transaction can pass policy checks",
      inputSchema: {
        chainId: z.string().min(1),
        to: z.string().min(1),
        value: z.string().min(1),
        data: z.string().optional(),
      },
    },
    async (args: { chainId: string; to: string; value: string; data?: string }) => {
      try {
        const result = await canTransact(args);
        return asTextContent(result);
      } catch (error) {
        return asErrorContent(error);
      }
    },
  );

  server.registerTool(
    "request_allowlist",
    {
      description: "Request a contract be added to policy allowlist",
      inputSchema: {
        contractAddress: z.string().min(1),
        chainId: z.string().min(1),
        reason: z.string().min(1),
        functions: z.array(z.string().min(1)).optional(),
      },
    },
    async (args: { contractAddress: string; chainId: string; reason: string; functions?: string[] }) => {
      try {
        const result = await requestAllowlist(args);
        return asTextContent(result);
      } catch (error) {
        return asErrorContent(error);
      }
    },
  );

  server.registerTool("get_wallet", { description: "Get wallet information and chain addresses" }, async () => {
    try {
      const wallet = await getWallet();
      return asTextContent(wallet);
    } catch (error) {
      return asErrorContent(error);
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
