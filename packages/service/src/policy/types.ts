export type PolicyPreset = "safe" | "normal" | "degen" | "custom";
export type BridgeMode = "no" | "stables_canonical" | "yes";
export type MemecoinMode = "no" | "capped" | "yes";
export type ContractMode = "allowlist" | "verified" | "blocklist_only";

export interface AgentPolicy {
  id: string;
  agentId: string;
  preset: PolicyPreset;
  version: number;
  updatedAt: number;
  updatedBy: string;

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

  contracts: {
    mode: ContractMode;
    allowlist: ContractAllowlistEntry[];
    blocklist: string[];
    tokenApprovalMode: "exact" | "capped" | "uncapped";
    tokenApprovalCapMultiplier?: number;
  };

  bridging: {
    mode: BridgeMode;
    allowedBridges: string[];
    allowedAssets: string[];
  };

  memecoins: {
    mode: MemecoinMode;
    perTxLimitUsd?: number;
    dailyLimitUsd?: number;
    detectionCriteria: {
      maxTokenAgeDays: number;
      maxMarketCapUsd: number;
      knownMemecoinList: string[];
    };
  };

  chains: {
    allowed: string[];
    perChainOverrides?: Record<
      string,
      {
        maxTransactionValueUsd?: number;
        autonomousThresholdUsd?: number;
      }
    >;
  };
}

export interface ContractAllowlistEntry {
  address: string;
  chainId: string;
  name: string;
  type: "dex" | "lending" | "nft" | "bridge" | "token" | "other";
  allowedFunctions?: AllowedFunction[];
  maxApprovalAmount?: string;
}

export interface AllowedFunction {
  selector: string;
  name: string;
  maxValue?: string;
}

export interface PolicyResult {
  allowed: boolean;
  requiresHumanApproval: boolean;
  reason?: string;
  action?: "request_allowlist_addition";
  evaluatedRules: EvaluatedRule[];
}

export interface EvaluatedRule {
  rule: string;
  passed: boolean;
  details?: string;
}
