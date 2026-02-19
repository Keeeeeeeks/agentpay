import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import type {
  ChainAdapter,
  GasEstimate,
  TokenBalance,
  TransactionInfo,
  TransactionReceipt,
  UnsignedTransaction,
} from "./interface.js";

interface SolanaChainConfig {
  chainId: string;
  rpcUrl?: string;
}

const DEFAULT_RPC: Record<string, string> = {
  "solana-mainnet": "https://api.mainnet-beta.solana.com",
  "solana-devnet": "https://api.devnet.solana.com",
  "solana-testnet": "https://api.testnet.solana.com",
};

export class SolanaChainAdapter implements ChainAdapter {
  readonly chainType = "solana" as const;
  readonly chainId: string;
  readonly displayName: string;
  readonly nativeToken = { symbol: "SOL", decimals: 9 };

  private connection: Connection;

  constructor(config: SolanaChainConfig) {
    this.chainId = config.chainId;
    this.displayName = config.chainId === "solana-mainnet" ? "Solana" : `Solana ${config.chainId.split("-")[1]}`;

    const rpc = config.rpcUrl ?? DEFAULT_RPC[config.chainId] ?? DEFAULT_RPC["solana-devnet"]!;
    this.connection = new Connection(rpc, "confirmed");
  }

  async getBalance(address: string): Promise<TokenBalance> {
    const pubkey = new PublicKey(address);
    const lamports = await this.connection.getBalance(pubkey);

    return {
      symbol: "SOL",
      name: "Solana",
      address: "native",
      balance: lamports.toString(),
      decimals: 9,
    };
  }

  async getTokenBalances(_address: string): Promise<TokenBalance[]> {
    // SPL token balance fetching requires token account parsing
    // Returning empty for MVP
    return [];
  }

  async getTransaction(hash: string): Promise<TransactionInfo | null> {
    try {
      const tx = await this.connection.getTransaction(hash, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) return null;

      const message = tx.transaction.message;
      const accountKeys = message.getAccountKeys();

      return {
        hash,
        from: accountKeys.get(0)?.toBase58() ?? "",
        to: accountKeys.get(1)?.toBase58() ?? "",
        value: (tx.meta?.postBalances[1] ?? 0).toString(),
        status: tx.meta?.err ? "failed" : "confirmed",
        blockNumber: tx.slot,
        timestamp: tx.blockTime ?? undefined,
      };
    } catch {
      return null;
    }
  }

  async broadcastTransaction(signedTx: string): Promise<string> {
    const buffer = Buffer.from(signedTx, "base64");
    const signature = await this.connection.sendRawTransaction(buffer, {
      skipPreflight: false,
    });
    return signature;
  }

  async waitForConfirmation(hash: string, timeoutMs = 60_000): Promise<TransactionReceipt> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.connection.getSignatureStatus(hash);

      if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmationStatus === "finalized") {
        return {
          hash,
          status: status.value.err ? "failed" : "confirmed",
          blockNumber: status.value.slot ?? 0,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error(`Solana transaction ${hash} confirmation timeout after ${timeoutMs}ms`);
  }

  async estimateGas(_tx: UnsignedTransaction): Promise<GasEstimate> {
    // Solana uses fixed fee structure, not gas
    const { feeCalculator } = await this.connection.getRecentBlockhash();

    return {
      gasLimit: "1", // Solana doesn't have gas in the EVM sense
      gasPriceGwei: (feeCalculator.lamportsPerSignature / LAMPORTS_PER_SOL).toString(),
    };
  }

  async getNonce(_address: string): Promise<number> {
    // Solana uses recent blockhash, not nonces in the EVM sense
    // Return 0 as placeholder — actual nonce handling is in tx building
    return 0;
  }
}
