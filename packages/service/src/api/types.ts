import type { TokenBalance } from "../chains/interface.js";

export interface TransactionRequest {
  chainId: string;
  to: string;
  value: string;
  data?: string;
  functionName?: string;
  functionArgs?: unknown[];
  urgency: "low" | "medium" | "high";
  reason: string;
}

export interface TransactionResponse {
  status: "approved" | "pending_human" | "rejected";
  transactionHash?: string;
  approvalUrl?: string;
  rejectionReason?: string;
  auditId: string;
}

export interface BalanceResponse {
  agentId: string;
  walletId: string;
  chains: Record<
    string,
    {
      chainId: string;
      displayName: string;
      address: string;
      native: TokenBalance;
      tokens: TokenBalance[];
    }
  >;
}

export interface PolicyRemainingResponse {
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
