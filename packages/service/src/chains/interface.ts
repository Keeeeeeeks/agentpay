export interface TokenBalance {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  decimals: number;
  balanceUsd?: number;
}

export interface TransactionInfo {
  hash: string;
  from: string;
  to: string;
  value: string;
  status: "pending" | "confirmed" | "failed";
  blockNumber?: number;
  timestamp?: number;
}

export interface TransactionReceipt {
  hash: string;
  status: "confirmed" | "failed";
  blockNumber: number;
  gasUsed?: string;
}

export interface GasEstimate {
  gasLimit: string;
  gasPriceGwei?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  estimatedCostUsd?: number;
}

export interface UnsignedTransaction {
  to: string;
  value: string;
  data?: string;
  chainId: string;
}

export interface ChainAdapter {
  readonly chainType: "evm" | "solana" | "stellar";
  readonly chainId: string;
  readonly displayName: string;
  readonly nativeToken: { symbol: string; decimals: number };

  getBalance(address: string): Promise<TokenBalance>;
  getTokenBalances(address: string): Promise<TokenBalance[]>;
  getTransaction(hash: string): Promise<TransactionInfo | null>;
  broadcastTransaction(signedTx: string): Promise<string>;
  waitForConfirmation(hash: string, timeoutMs?: number): Promise<TransactionReceipt>;
  estimateGas(tx: UnsignedTransaction): Promise<GasEstimate>;
  getNonce(address: string): Promise<number>;
}
