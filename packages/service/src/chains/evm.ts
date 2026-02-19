import {
  createPublicClient,
  http,
  formatEther,
  formatGwei,
  type PublicClient,
  type Chain,
} from "viem";
import {
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
  sepolia,
} from "viem/chains";

import type {
  ChainAdapter,
  GasEstimate,
  TokenBalance,
  TransactionInfo,
  TransactionReceipt,
  UnsignedTransaction,
} from "./interface.js";

const CHAIN_MAP: Record<string, Chain> = {
  "eip155:1": mainnet,
  "1": mainnet,
  "eip155:8453": base,
  "8453": base,
  "eip155:42161": arbitrum,
  "42161": arbitrum,
  "eip155:10": optimism,
  "10": optimism,
  "eip155:137": polygon,
  "137": polygon,
  "eip155:11155111": sepolia,
  "11155111": sepolia,
};

interface EvmChainConfig {
  chainId: string;
  rpcUrl?: string;
}

export class EvmChainAdapter implements ChainAdapter {
  readonly chainType = "evm" as const;
  readonly chainId: string;
  readonly displayName: string;
  readonly nativeToken: { symbol: string; decimals: number };

  private client: PublicClient;

  constructor(config: EvmChainConfig) {
    this.chainId = config.chainId;

    const chain = CHAIN_MAP[config.chainId];
    if (!chain) {
      throw new Error(`Unsupported EVM chain: ${config.chainId}`);
    }

    this.displayName = chain.name;
    this.nativeToken = {
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
    };

    this.client = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });
  }

  async getBalance(address: string): Promise<TokenBalance> {
    const balance = await this.client.getBalance({
      address: address as `0x${string}`,
    });

    return {
      symbol: this.nativeToken.symbol,
      name: this.nativeToken.symbol,
      address: "native",
      balance: balance.toString(),
      decimals: this.nativeToken.decimals,
    };
  }

  async getTokenBalances(_address: string): Promise<TokenBalance[]> {
    // ERC-20 balance fetching requires token list + multicall
    // Returning empty for MVP — can integrate with token list APIs later
    return [];
  }

  async getTransaction(hash: string): Promise<TransactionInfo | null> {
    try {
      const tx = await this.client.getTransaction({
        hash: hash as `0x${string}`,
      });

      if (!tx) return null;

      let status: "pending" | "confirmed" | "failed" = "pending";
      let blockNumber: number | undefined;

      if (tx.blockNumber) {
        const receipt = await this.client.getTransactionReceipt({
          hash: hash as `0x${string}`,
        });
        status = receipt.status === "success" ? "confirmed" : "failed";
        blockNumber = Number(tx.blockNumber);
      }

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to ?? "",
        value: tx.value.toString(),
        status,
        blockNumber,
      };
    } catch {
      return null;
    }
  }

  async broadcastTransaction(signedTx: string): Promise<string> {
    const hash = await this.client.sendRawTransaction({
      serializedTransaction: signedTx as `0x${string}`,
    });
    return hash;
  }

  async waitForConfirmation(hash: string, timeoutMs = 60_000): Promise<TransactionReceipt> {
    const receipt = await this.client.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      timeout: timeoutMs,
    });

    return {
      hash: receipt.transactionHash,
      status: receipt.status === "success" ? "confirmed" : "failed",
      blockNumber: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  async estimateGas(tx: UnsignedTransaction): Promise<GasEstimate> {
    const gasLimit = await this.client.estimateGas({
      to: tx.to as `0x${string}`,
      value: BigInt(tx.value || "0"),
      data: (tx.data as `0x${string}`) ?? undefined,
    });

    const feeData = await this.client.estimateFeesPerGas();

    return {
      gasLimit: gasLimit.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
      gasPriceGwei: feeData.maxFeePerGas ? formatGwei(feeData.maxFeePerGas) : undefined,
    };
  }

  async getNonce(address: string): Promise<number> {
    return this.client.getTransactionCount({
      address: address as `0x${string}`,
    });
  }
}
