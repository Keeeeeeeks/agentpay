import { z } from "zod";

export interface AgentPayConfig {
  baseUrl: string;
  token: string;
  timeout?: number;
}

export interface SignTransactionRequest {
  chainId: string;
  to: string;
  value: string;
  data?: string;
  functionName?: string;
  functionArgs?: unknown[];
  urgency?: "low" | "medium" | "high";
  reason: string;
}

export interface SignTransactionResponse {
  status: "approved" | "pending_human" | "rejected";
  transactionHash?: string;
  approvalUrl?: string;
  rejectionReason?: string;
  auditId: string;
}

export interface BalanceResponse {
  agentId: string;
  walletId: string;
  chains: Record<string, ChainBalance>;
}

export interface ChainBalance {
  chainId: string;
  displayName: string;
  address: string;
  native: TokenBalance;
  tokens: TokenBalance[];
}

export interface TokenBalance {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  decimals: number;
  balanceUsd?: number;
}

export interface PolicyInfo {
  id: string;
  preset: string;
  spending: {
    maxTransactionValueUsd: number;
    dailyLimitUsd: number;
    weeklyLimitUsd: number;
  };
  rateLimits: {
    maxTxPerHour: number;
    maxTxPerDay: number;
  };
  approval: {
    autonomousThresholdUsd: number;
  };
  chains: {
    allowed: string[];
  };
}

export interface PolicyRemaining {
  dailyLimitUsd: number;
  dailySpentUsd: number;
  dailyRemainingUsd: number;
  weeklyLimitUsd: number;
  weeklySpentUsd: number;
  weeklyRemainingUsd: number;
  txThisHour: number;
  maxTxPerHour: number;
  txToday: number;
  maxTxPerDay: number;
}

export interface CanTransactRequest {
  chainId: string;
  to: string;
  value: string;
  data?: string;
}

export interface CanTransactResponse {
  canTransact: boolean;
  wouldRequireApproval: boolean;
  reason?: string;
}

export interface AllowlistRequest {
  contractAddress: string;
  chainId: string;
  reason: string;
  functions?: string[];
}

export interface TransactionStatus {
  hash: string;
  from: string;
  to: string;
  value: string;
  status: "pending" | "confirmed" | "failed";
  blockNumber?: number;
  timestamp?: number;
}

export const agentPayConfigSchema = z.object({
  baseUrl: z.string().min(1),
  token: z.string().min(1),
  timeout: z.number().int().positive().optional(),
});

export const signTransactionRequestSchema = z.object({
  chainId: z.string().min(1),
  to: z.string().min(1),
  value: z.string().min(1),
  data: z.string().optional(),
  functionName: z.string().optional(),
  functionArgs: z.array(z.unknown()).optional(),
  urgency: z.enum(["low", "medium", "high"]).optional(),
  reason: z.string().min(1),
});

export const signTransactionResponseSchema = z.object({
  status: z.enum(["approved", "pending_human", "rejected"]),
  transactionHash: z.string().optional(),
  approvalUrl: z.string().optional(),
  rejectionReason: z.string().optional(),
  auditId: z.string().min(1),
});

export const tokenBalanceSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  address: z.string().min(1),
  balance: z.string().min(1),
  decimals: z.number().int(),
  balanceUsd: z.number().optional(),
});

export const chainBalanceSchema = z.object({
  chainId: z.string().min(1),
  displayName: z.string().min(1),
  address: z.string().min(1),
  native: tokenBalanceSchema,
  tokens: z.array(tokenBalanceSchema),
});

export const balanceResponseSchema = z.object({
  agentId: z.string().min(1),
  walletId: z.string().min(1),
  chains: z.record(chainBalanceSchema),
});

export const policyInfoSchema = z.object({
  id: z.string().min(1),
  preset: z.string().min(1),
  spending: z.object({
    maxTransactionValueUsd: z.number(),
    dailyLimitUsd: z.number(),
    weeklyLimitUsd: z.number(),
  }),
  rateLimits: z.object({
    maxTxPerHour: z.number(),
    maxTxPerDay: z.number(),
  }),
  approval: z.object({
    autonomousThresholdUsd: z.number(),
  }),
  chains: z.object({
    allowed: z.array(z.string()),
  }),
});

export const policyRemainingSchema = z.object({
  dailyLimitUsd: z.number(),
  dailySpentUsd: z.number(),
  dailyRemainingUsd: z.number(),
  weeklyLimitUsd: z.number(),
  weeklySpentUsd: z.number(),
  weeklyRemainingUsd: z.number(),
  txThisHour: z.number(),
  maxTxPerHour: z.number(),
  txToday: z.number(),
  maxTxPerDay: z.number(),
});

export const canTransactRequestSchema = z.object({
  chainId: z.string().min(1),
  to: z.string().min(1),
  value: z.string().min(1),
  data: z.string().optional(),
});

export const canTransactResponseSchema = z.object({
  canTransact: z.boolean(),
  wouldRequireApproval: z.boolean(),
  reason: z.string().optional(),
});

export const allowlistRequestSchema = z.object({
  contractAddress: z.string().min(1),
  chainId: z.string().min(1),
  reason: z.string().min(1),
  functions: z.array(z.string().min(1)).optional(),
});

export const transactionStatusSchema = z.object({
  hash: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  value: z.string().min(1),
  status: z.enum(["pending", "confirmed", "failed"]),
  blockNumber: z.number().optional(),
  timestamp: z.number().optional(),
});
