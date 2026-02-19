import { nanoid } from "nanoid";

import type { AgentPolicy, PolicyPreset } from "./types.js";

const SHARED_CHAINS = ["eip155:1", "eip155:8453", "eip155:10", "eip155:42161"];

const BASE_POLICY = {
  contracts: {
    allowlist: [],
    blocklist: [],
  },
  memecoins: {
    detectionCriteria: {
      knownMemecoinList: [],
    },
  },
  chains: {
    allowed: SHARED_CHAINS,
  },
} as const;

export const SAFE_PRESET: Omit<AgentPolicy, "id" | "agentId" | "version" | "updatedAt" | "updatedBy" | "preset"> = {
  spending: {
    maxTransactionValueUsd: 25,
    dailyLimitUsd: 100,
    weeklyLimitUsd: 500,
  },
  rateLimits: {
    maxTxPerHour: 5,
    maxTxPerDay: 20,
  },
  approval: {
    autonomousThresholdUsd: 25,
  },
  contracts: {
    mode: "allowlist",
    allowlist: [...BASE_POLICY.contracts.allowlist],
    blocklist: [...BASE_POLICY.contracts.blocklist],
    tokenApprovalMode: "exact",
  },
  bridging: {
    mode: "no",
    allowedBridges: [],
    allowedAssets: [],
  },
  memecoins: {
    mode: "no",
    detectionCriteria: {
      maxTokenAgeDays: 0,
      maxMarketCapUsd: 0,
      knownMemecoinList: [...BASE_POLICY.memecoins.detectionCriteria.knownMemecoinList],
    },
  },
  chains: {
    allowed: [...BASE_POLICY.chains.allowed],
  },
};

export const NORMAL_PRESET: Omit<AgentPolicy, "id" | "agentId" | "version" | "updatedAt" | "updatedBy" | "preset"> = {
  spending: {
    maxTransactionValueUsd: 250,
    dailyLimitUsd: 2500,
    weeklyLimitUsd: 10000,
  },
  rateLimits: {
    maxTxPerHour: 20,
    maxTxPerDay: 100,
  },
  approval: {
    autonomousThresholdUsd: 250,
  },
  contracts: {
    mode: "verified",
    allowlist: [...BASE_POLICY.contracts.allowlist],
    blocklist: [...BASE_POLICY.contracts.blocklist],
    tokenApprovalMode: "capped",
    tokenApprovalCapMultiplier: 2,
  },
  bridging: {
    mode: "stables_canonical",
    allowedBridges: ["across", "stargate", "cctp"],
    allowedAssets: ["USDC", "USDT", "DAI"],
  },
  memecoins: {
    mode: "capped",
    perTxLimitUsd: 50,
    dailyLimitUsd: 200,
    detectionCriteria: {
      maxTokenAgeDays: 30,
      maxMarketCapUsd: 10_000_000,
      knownMemecoinList: [...BASE_POLICY.memecoins.detectionCriteria.knownMemecoinList],
    },
  },
  chains: {
    allowed: [...BASE_POLICY.chains.allowed],
  },
};

export const DEGEN_PRESET: Omit<AgentPolicy, "id" | "agentId" | "version" | "updatedAt" | "updatedBy" | "preset"> = {
  spending: {
    maxTransactionValueUsd: 10000,
    dailyLimitUsd: 50000,
    weeklyLimitUsd: 250000,
  },
  rateLimits: {
    maxTxPerHour: 100,
    maxTxPerDay: 500,
  },
  approval: {
    autonomousThresholdUsd: 10000,
  },
  contracts: {
    mode: "blocklist_only",
    allowlist: [...BASE_POLICY.contracts.allowlist],
    blocklist: [...BASE_POLICY.contracts.blocklist],
    tokenApprovalMode: "uncapped",
  },
  bridging: {
    mode: "yes",
    allowedBridges: [],
    allowedAssets: [],
  },
  memecoins: {
    mode: "yes",
    detectionCriteria: {
      maxTokenAgeDays: 3650,
      maxMarketCapUsd: Number.MAX_SAFE_INTEGER,
      knownMemecoinList: [...BASE_POLICY.memecoins.detectionCriteria.knownMemecoinList],
    },
  },
  chains: {
    allowed: [...BASE_POLICY.chains.allowed],
  },
};

const PRESET_MAP: Record<PolicyPreset, Omit<AgentPolicy, "id" | "agentId" | "version" | "updatedAt" | "updatedBy" | "preset">> = {
  safe: SAFE_PRESET,
  normal: NORMAL_PRESET,
  degen: DEGEN_PRESET,
  custom: NORMAL_PRESET,
};

export function createPolicyFromPreset(
  agentId: string,
  preset: PolicyPreset,
  updatedBy: string,
): AgentPolicy {
  const source = PRESET_MAP[preset];

  return {
    id: nanoid(),
    agentId,
    preset,
    version: 1,
    updatedAt: Date.now(),
    updatedBy,
    spending: { ...source.spending },
    rateLimits: { ...source.rateLimits },
    approval: { ...source.approval },
    contracts: {
      ...source.contracts,
      allowlist: source.contracts.allowlist.map((entry) => ({
        ...entry,
        allowedFunctions: entry.allowedFunctions?.map((fn) => ({ ...fn })),
      })),
      blocklist: [...source.contracts.blocklist],
    },
    bridging: {
      ...source.bridging,
      allowedBridges: [...source.bridging.allowedBridges],
      allowedAssets: [...source.bridging.allowedAssets],
    },
    memecoins: {
      ...source.memecoins,
      detectionCriteria: {
        ...source.memecoins.detectionCriteria,
        knownMemecoinList: [...source.memecoins.detectionCriteria.knownMemecoinList],
      },
    },
    chains: {
      ...source.chains,
      allowed: [...source.chains.allowed],
      perChainOverrides: source.chains.perChainOverrides
        ? Object.fromEntries(
            Object.entries(source.chains.perChainOverrides).map(([chainId, override]) => [chainId, { ...override }]),
          )
        : undefined,
    },
  };
}
