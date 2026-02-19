import type { TransactionRequest } from "../api/types.js";
import type {
  AgentPolicy,
  ContractAllowlistEntry,
  EvaluatedRule,
  PolicyResult,
} from "./types.js";

export interface SpendingTracker {
  getDailySpendUsd(agentId: string, chainId: string): Promise<number>;
  getWeeklySpendUsd(agentId: string, chainId: string): Promise<number>;
  getHourlyTransactionCount(agentId: string): Promise<number>;
  getDailyTransactionCount(agentId: string): Promise<number>;
  getMemecoinDailySpendUsd(agentId: string): Promise<number>;
}

export interface PriceOracle {
  convertToUsd(value: string, chainId: string): Promise<number>;
}

export interface TokenRevoker {
  isRevoked(jti: string): Promise<boolean>;
}

export interface AssetClassifier {
  isBridgeContract(address: string, chainId: string): Promise<boolean>;
  isMemecoin(
    address: string,
    chainId: string,
    criteria: AgentPolicy["memecoins"]["detectionCriteria"],
  ): Promise<boolean>;
}

export class PolicyEngine {
  public constructor(
    private readonly spendingTracker: SpendingTracker,
    private readonly priceOracle: PriceOracle,
    private readonly tokenRevoker: TokenRevoker,
    private readonly assetClassifier: AssetClassifier,
  ) {}

  public async evaluate(
    policy: AgentPolicy,
    tx: TransactionRequest,
    jti: string,
  ): Promise<PolicyResult> {
    const evaluatedRules: EvaluatedRule[] = [];

    const revoked = await this.tokenRevoker.isRevoked(jti);
    const revocationRule: EvaluatedRule = {
      rule: "token_revocation",
      passed: !revoked,
      details: revoked ? "Token has been revoked" : "Token is active",
    };
    evaluatedRules.push(revocationRule);
    if (revoked) {
      return this.reject(evaluatedRules, revocationRule.details);
    }

    const chainRule = this.checkChainAllowed(policy, tx.chainId);
    evaluatedRules.push(chainRule);
    if (!chainRule.passed) {
      return this.reject(evaluatedRules, chainRule.details);
    }

    const blocklistRule = this.checkBlocklist(policy, tx.to);
    evaluatedRules.push(blocklistRule);
    if (!blocklistRule.passed) {
      return this.reject(evaluatedRules, blocklistRule.details);
    }

    const allowlistEntry = this.findAllowlistEntry(policy, tx.to, tx.chainId);
    const contractModeRule = this.checkContractMode(policy, allowlistEntry);
    evaluatedRules.push(contractModeRule);
    if (!contractModeRule.passed) {
      return {
        allowed: false,
        requiresHumanApproval: false,
        reason: contractModeRule.details,
        action: "request_allowlist_addition",
        evaluatedRules,
      };
    }

    const functionRule = this.checkFunctionAllowlist(tx.data, allowlistEntry);
    evaluatedRules.push(functionRule);
    if (!functionRule.passed) {
      return this.reject(evaluatedRules, functionRule.details);
    }

    const approvalRule = this.checkTokenApprovalMode(policy, tx, allowlistEntry);
    evaluatedRules.push(approvalRule);
    if (!approvalRule.passed) {
      return this.reject(evaluatedRules, approvalRule.details);
    }

    const bridgeTx = await this.isBridgeTransaction(policy, tx);
    const bridgeRule = this.checkBridgeMode(policy, tx, bridgeTx);
    evaluatedRules.push(bridgeRule);
    if (!bridgeRule.passed) {
      return this.reject(evaluatedRules, bridgeRule.details);
    }

    const valueUsd = await this.priceOracle.convertToUsd(tx.value, tx.chainId);

    const maxValueRule = this.checkMaxTransactionValue(policy, tx.chainId, valueUsd);
    evaluatedRules.push(maxValueRule);
    if (!maxValueRule.passed) {
      return this.reject(evaluatedRules, maxValueRule.details);
    }

    const dailySpend = await this.spendingTracker.getDailySpendUsd(policy.agentId, tx.chainId);
    const dailyRule = this.checkDailyLimit(policy, dailySpend, valueUsd);
    evaluatedRules.push(dailyRule);
    if (!dailyRule.passed) {
      return this.reject(evaluatedRules, dailyRule.details);
    }

    const weeklySpend = await this.spendingTracker.getWeeklySpendUsd(policy.agentId, tx.chainId);
    const weeklyRule = this.checkWeeklyLimit(policy, weeklySpend, valueUsd);
    evaluatedRules.push(weeklyRule);
    if (!weeklyRule.passed) {
      return this.reject(evaluatedRules, weeklyRule.details);
    }

    const rateLimitRule = await this.checkRateLimits(policy);
    evaluatedRules.push(rateLimitRule);
    if (!rateLimitRule.passed) {
      return this.reject(evaluatedRules, rateLimitRule.details);
    }

    const memecoinTx = await this.isMemecoinTransaction(policy, tx);
    const memecoinRule = await this.checkMemecoinMode(policy, memecoinTx, valueUsd);
    evaluatedRules.push(memecoinRule);
    if (!memecoinRule.passed) {
      return this.reject(evaluatedRules, memecoinRule.details);
    }

    const threshold = this.getAutonomousThreshold(policy, tx.chainId);
    const requiresHumanApproval = valueUsd > threshold;
    evaluatedRules.push({
      rule: "autonomous_threshold",
      passed: true,
      details: requiresHumanApproval
        ? `Value $${valueUsd.toFixed(2)} exceeds autonomous threshold $${threshold.toFixed(2)}`
        : `Value $${valueUsd.toFixed(2)} is within autonomous threshold $${threshold.toFixed(2)}`,
    });

    return {
      allowed: true,
      requiresHumanApproval,
      evaluatedRules,
    };
  }

  private reject(evaluatedRules: EvaluatedRule[], reason?: string): PolicyResult {
    return {
      allowed: false,
      requiresHumanApproval: false,
      reason,
      evaluatedRules,
    };
  }

  private checkChainAllowed(policy: AgentPolicy, chainId: string): EvaluatedRule {
    const passed = policy.chains.allowed.includes(chainId);
    return {
      rule: "chain_allowed",
      passed,
      details: passed ? `Chain ${chainId} is allowed` : `Chain ${chainId} is not allowed`,
    };
  }

  private checkBlocklist(policy: AgentPolicy, to: string): EvaluatedRule {
    const normalizedTo = to.toLowerCase();
    const blocked = policy.contracts.blocklist.some(
      (entry) => entry.toLowerCase() === normalizedTo,
    );
    return {
      rule: "contract_blocklist",
      passed: !blocked,
      details: blocked ? `Address ${to} is blocklisted` : "Address is not blocklisted",
    };
  }

  private findAllowlistEntry(
    policy: AgentPolicy,
    to: string,
    chainId: string,
  ): ContractAllowlistEntry | undefined {
    const normalizedTo = to.toLowerCase();
    return policy.contracts.allowlist.find(
      (entry) =>
        entry.chainId === chainId && entry.address.toLowerCase() === normalizedTo,
    );
  }

  private checkContractMode(
    policy: AgentPolicy,
    allowlistEntry?: ContractAllowlistEntry,
  ): EvaluatedRule {
    if (policy.contracts.mode === "allowlist") {
      return {
        rule: "contract_mode",
        passed: allowlistEntry !== undefined,
        details:
          allowlistEntry !== undefined
            ? `Contract ${allowlistEntry.name} is allowlisted`
            : "Contract not in allowlist",
      };
    }

    if (policy.contracts.mode === "verified") {
      return {
        rule: "contract_mode",
        passed: true,
        details:
          allowlistEntry !== undefined
            ? `Contract ${allowlistEntry.name} is verified by allowlist`
            : "Verified mode allows non-blocklisted contracts",
      };
    }

    return {
      rule: "contract_mode",
      passed: true,
      details: "Blocklist-only mode enabled",
    };
  }

  private checkFunctionAllowlist(
    data: string | undefined,
    allowlistEntry: ContractAllowlistEntry | undefined,
  ): EvaluatedRule {
    if (!data || !allowlistEntry?.allowedFunctions?.length) {
      return {
        rule: "function_allowlist",
        passed: true,
        details: "No function restrictions configured",
      };
    }

    const selector = this.extractSelector(data);
    const allowedFunction = allowlistEntry.allowedFunctions.find(
      (fn) => fn.selector.toLowerCase() === selector,
    );

    return {
      rule: "function_allowlist",
      passed: allowedFunction !== undefined,
      details:
        allowedFunction !== undefined
          ? `Function ${allowedFunction.name} is allowed`
          : `Function selector ${selector} is not allowed`,
    };
  }

  private checkTokenApprovalMode(
    policy: AgentPolicy,
    tx: TransactionRequest,
    allowlistEntry: ContractAllowlistEntry | undefined,
  ): EvaluatedRule {
    const selector = tx.data ? this.extractSelector(tx.data) : undefined;
    if (selector !== "0x095ea7b3") {
      return {
        rule: "token_approval_mode",
        passed: true,
        details: "Not a token approval transaction",
      };
    }

    const approvalAmount = tx.data ? this.extractApprovalAmount(tx.data) : undefined;
    if (approvalAmount === undefined) {
      return {
        rule: "token_approval_mode",
        passed: false,
        details: "Unable to parse token approval amount",
      };
    }

    const mode = policy.contracts.tokenApprovalMode;
    if (mode === "uncapped") {
      return {
        rule: "token_approval_mode",
        passed: true,
        details: "Uncapped token approval mode enabled",
      };
    }

    const baseCap = allowlistEntry?.maxApprovalAmount
      ? this.parseBigInt(allowlistEntry.maxApprovalAmount)
      : undefined;

    if (baseCap === undefined) {
      return {
        rule: "token_approval_mode",
        passed: false,
        details: "Approval transaction requires allowlist maxApprovalAmount",
      };
    }

    if (mode === "exact") {
      const passed = approvalAmount <= baseCap;
      return {
        rule: "token_approval_mode",
        passed,
        details: passed
          ? "Approval amount is within exact policy cap"
          : "Approval amount exceeds exact policy cap",
      };
    }

    const multiplier = policy.contracts.tokenApprovalCapMultiplier ?? 1;
    const scaledCap = BigInt(Math.floor(multiplier * 10000));
    const cappedLimit = (baseCap * scaledCap) / 10000n;
    const passed = approvalAmount <= cappedLimit;

    return {
      rule: "token_approval_mode",
      passed,
      details: passed
        ? `Approval amount is within capped policy (${multiplier}x)`
        : `Approval amount exceeds capped policy (${multiplier}x)`,
    };
  }

  private async isBridgeTransaction(
    policy: AgentPolicy,
    tx: TransactionRequest,
  ): Promise<boolean> {
    const normalizedTo = tx.to.toLowerCase();
    const knownBridge = policy.bridging.allowedBridges.some(
      (bridge) => bridge.toLowerCase() === normalizedTo,
    );

    if (knownBridge) {
      return true;
    }

    return this.assetClassifier.isBridgeContract(tx.to, tx.chainId);
  }

  private checkBridgeMode(
    policy: AgentPolicy,
    tx: TransactionRequest,
    isBridgeTx: boolean,
  ): EvaluatedRule {
    if (!isBridgeTx) {
      return {
        rule: "bridge_mode",
        passed: true,
        details: "Not a bridge transaction",
      };
    }

    if (policy.bridging.mode === "no") {
      return {
        rule: "bridge_mode",
        passed: false,
        details: "Bridging is disabled by policy",
      };
    }

    if (policy.bridging.mode === "stables_canonical") {
      const allowedBridge = policy.bridging.allowedBridges.some(
        (bridge) => bridge.toLowerCase() === tx.to.toLowerCase(),
      );

      return {
        rule: "bridge_mode",
        passed: allowedBridge,
        details: allowedBridge
          ? "Bridge transaction is on canonical bridge"
          : "Bridge transaction is not on canonical bridge allowlist",
      };
    }

    return {
      rule: "bridge_mode",
      passed: true,
      details: "Bridging is fully enabled",
    };
  }

  private async isMemecoinTransaction(
    policy: AgentPolicy,
    tx: TransactionRequest,
  ): Promise<boolean> {
    const normalizedTo = tx.to.toLowerCase();
    const inKnownList = policy.memecoins.detectionCriteria.knownMemecoinList.some(
      (address) => address.toLowerCase() === normalizedTo,
    );

    if (inKnownList) {
      return true;
    }

    return this.assetClassifier.isMemecoin(
      tx.to,
      tx.chainId,
      policy.memecoins.detectionCriteria,
    );
  }

  private async checkMemecoinMode(
    policy: AgentPolicy,
    isMemecoinTx: boolean,
    valueUsd: number,
  ): Promise<EvaluatedRule> {
    if (!isMemecoinTx) {
      return {
        rule: "memecoin_mode",
        passed: true,
        details: "Not a memecoin transaction",
      };
    }

    if (policy.memecoins.mode === "no") {
      return {
        rule: "memecoin_mode",
        passed: false,
        details: "Memecoin transactions are disabled",
      };
    }

    if (policy.memecoins.mode === "yes") {
      return {
        rule: "memecoin_mode",
        passed: true,
        details: "Memecoin transactions are allowed",
      };
    }

    const perTxLimit = policy.memecoins.perTxLimitUsd;
    if (perTxLimit !== undefined && valueUsd > perTxLimit) {
      return {
        rule: "memecoin_mode",
        passed: false,
        details: `Memecoin transaction value $${valueUsd.toFixed(2)} exceeds per-tx limit $${perTxLimit.toFixed(2)}`,
      };
    }

    const dailyLimit = policy.memecoins.dailyLimitUsd;
    if (dailyLimit !== undefined) {
      const spent = await this.spendingTracker.getMemecoinDailySpendUsd(policy.agentId);
      if (spent + valueUsd > dailyLimit) {
        return {
          rule: "memecoin_mode",
          passed: false,
          details: `Memecoin daily spend $${(spent + valueUsd).toFixed(2)} exceeds daily limit $${dailyLimit.toFixed(2)}`,
        };
      }
    }

    return {
      rule: "memecoin_mode",
      passed: true,
      details: "Memecoin transaction is within capped limits",
    };
  }

  private checkMaxTransactionValue(
    policy: AgentPolicy,
    chainId: string,
    valueUsd: number,
  ): EvaluatedRule {
    const chainOverride = policy.chains.perChainOverrides?.[chainId];
    const maxValueUsd =
      chainOverride?.maxTransactionValueUsd ?? policy.spending.maxTransactionValueUsd;
    const passed = valueUsd <= maxValueUsd;

    return {
      rule: "max_transaction_value",
      passed,
      details: passed
        ? `Value $${valueUsd.toFixed(2)} is within max $${maxValueUsd.toFixed(2)}`
        : `Value $${valueUsd.toFixed(2)} exceeds max $${maxValueUsd.toFixed(2)}`,
    };
  }

  private checkDailyLimit(
    policy: AgentPolicy,
    currentDailySpendUsd: number,
    txValueUsd: number,
  ): EvaluatedRule {
    const total = currentDailySpendUsd + txValueUsd;
    const passed = total <= policy.spending.dailyLimitUsd;

    return {
      rule: "daily_limit",
      passed,
      details: passed
        ? `Daily spend $${total.toFixed(2)} is within limit $${policy.spending.dailyLimitUsd.toFixed(2)}`
        : `Daily spend $${total.toFixed(2)} exceeds limit $${policy.spending.dailyLimitUsd.toFixed(2)}`,
    };
  }

  private checkWeeklyLimit(
    policy: AgentPolicy,
    currentWeeklySpendUsd: number,
    txValueUsd: number,
  ): EvaluatedRule {
    const total = currentWeeklySpendUsd + txValueUsd;
    const passed = total <= policy.spending.weeklyLimitUsd;

    return {
      rule: "weekly_limit",
      passed,
      details: passed
        ? `Weekly spend $${total.toFixed(2)} is within limit $${policy.spending.weeklyLimitUsd.toFixed(2)}`
        : `Weekly spend $${total.toFixed(2)} exceeds limit $${policy.spending.weeklyLimitUsd.toFixed(2)}`,
    };
  }

  private async checkRateLimits(policy: AgentPolicy): Promise<EvaluatedRule> {
    const hourlyCount = await this.spendingTracker.getHourlyTransactionCount(policy.agentId);
    if (hourlyCount >= policy.rateLimits.maxTxPerHour) {
      return {
        rule: "rate_limits",
        passed: false,
        details: `Hourly transaction count ${hourlyCount} reached limit ${policy.rateLimits.maxTxPerHour}`,
      };
    }

    const dailyCount = await this.spendingTracker.getDailyTransactionCount(policy.agentId);
    if (dailyCount >= policy.rateLimits.maxTxPerDay) {
      return {
        rule: "rate_limits",
        passed: false,
        details: `Daily transaction count ${dailyCount} reached limit ${policy.rateLimits.maxTxPerDay}`,
      };
    }

    return {
      rule: "rate_limits",
      passed: true,
      details: `Within rate limits (hourly ${hourlyCount}/${policy.rateLimits.maxTxPerHour}, daily ${dailyCount}/${policy.rateLimits.maxTxPerDay})`,
    };
  }

  private getAutonomousThreshold(policy: AgentPolicy, chainId: string): number {
    const chainOverride = policy.chains.perChainOverrides?.[chainId];
    return chainOverride?.autonomousThresholdUsd ?? policy.approval.autonomousThresholdUsd;
  }

  private extractSelector(data: string): string {
    return data.slice(0, 10).toLowerCase();
  }

  private extractApprovalAmount(data: string): bigint | undefined {
    const normalized = data.startsWith("0x") ? data.slice(2) : data;
    if (normalized.length < 8 + 64 + 64) {
      return undefined;
    }

    const amountHex = normalized.slice(8 + 64, 8 + 64 + 64);
    return this.parseBigInt(`0x${amountHex}`);
  }

  private parseBigInt(value: string): bigint | undefined {
    try {
      return BigInt(value);
    } catch {
      return undefined;
    }
  }
}
