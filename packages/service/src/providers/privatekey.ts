import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
  type Chain,
  type Account,
  parseEther,
  type TransportConfig,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
  sepolia,
  baseSepolia,
} from "viem/chains";

import type {
  ProviderConfig,
  SignableTransaction,
  SignedTransaction,
  SigningProvider,
  WalletInfo,
  WalletType,
} from "./interface.js";

const CHAIN_MAP: Record<string, Chain> = {
  "eip155:1": mainnet,
  "eip155:8453": base,
  "eip155:42161": arbitrum,
  "eip155:10": optimism,
  "eip155:137": polygon,
  "eip155:11155111": sepolia,
  "eip155:84532": baseSepolia,
};

/**
 * Private key signing provider for REAL testnet/mainnet transactions.
 *
 * Uses a raw private key via viem to create wallets and sign transactions.
 * The same key is used for all EVM chains (same address, different chain IDs).
 *
 * WARNING: Only use with throwaway keys for testing. Never use with real funds.
 */
export class PrivateKeyProvider implements SigningProvider {
  readonly name = "privatekey";

  private account?: Account;
  private address?: string;
  private wallets = new Map<string, WalletInfo>();
  private initialized = false;
  private rpcUrls: Record<string, string> = {};

  async initialize(config: ProviderConfig): Promise<void> {
    const privateKey = config.apiPrivateKey;
    if (!privateKey) {
      throw new Error("PrivateKeyProvider requires apiPrivateKey in config");
    }

    // Ensure the key has 0x prefix
    const formattedKey = privateKey.startsWith("0x")
      ? (privateKey as `0x${string}`)
      : (`0x${privateKey}` as `0x${string}`);

    this.account = privateKeyToAccount(formattedKey);
    this.address = this.account.address;

    // Store any custom RPC URLs from config
    if (config.rpcUrls && typeof config.rpcUrls === "object") {
      this.rpcUrls = config.rpcUrls as Record<string, string>;
    }

    this.initialized = true;
  }

  async createWallet(type: WalletType, _identifier: string): Promise<WalletInfo> {
    this.assertInitialized();

    if (type !== "EVM") {
      throw new Error("PrivateKeyProvider only supports EVM wallets");
    }

    const walletId = `pk_${this.address!.slice(2, 14)}`;
    const wallet: WalletInfo = {
      walletId,
      address: this.address!,
      type: "EVM",
      chainId: "eip155:1",
      provider: this.name,
    };

    this.wallets.set(walletId, wallet);
    return wallet;
  }

  async getAddress(_chainId: string): Promise<string> {
    this.assertInitialized();
    return this.address!;
  }

  async listWallets(): Promise<WalletInfo[]> {
    return Array.from(this.wallets.values());
  }

  async signTransaction(tx: SignableTransaction): Promise<SignedTransaction> {
    this.assertInitialized();

    const chain = CHAIN_MAP[tx.chainId];
    if (!chain) {
      throw new Error(`Unsupported chain for PrivateKeyProvider: ${tx.chainId}`);
    }

    const rpcUrl = this.rpcUrls[tx.chainId];

    const walletClient = createWalletClient({
      account: this.account!,
      chain,
      transport: http(rpcUrl),
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // Get nonce and gas estimates
    const nonce = tx.nonce ?? await publicClient.getTransactionCount({
      address: this.address! as `0x${string}`,
    });

    const toAddress = tx.to as `0x${string}`;
    const value = this.parseValue(tx.value);

    // Prepare the transaction request
    const txRequest: any = {
      to: toAddress,
      value,
      data: tx.data ? (tx.data as `0x${string}`) : undefined,
      nonce,
      chain,
      account: this.account!,
    };

    // If gas params provided, use them; otherwise let viem estimate
    if (tx.maxFeePerGas) {
      txRequest.maxFeePerGas = BigInt(tx.maxFeePerGas);
    }
    if (tx.maxPriorityFeePerGas) {
      txRequest.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
    }
    if (tx.gasLimit) {
      txRequest.gas = BigInt(tx.gasLimit);
    }

    // Use prepareTransactionRequest to fill in gas if needed
    const prepared = await walletClient.prepareTransactionRequest(txRequest);

    // Sign the transaction
    const signedTx = await walletClient.signTransaction(prepared as any);

    // Send the raw transaction to get the hash
    const hash = await publicClient.sendRawTransaction({
      serializedTransaction: signedTx,
    });

    return {
      hash,
      signedTransaction: signedTx,
    };
  }

  async signMessage(message: string, chainId: string): Promise<string> {
    this.assertInitialized();

    const chain = CHAIN_MAP[chainId];
    if (!chain) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    const walletClient = createWalletClient({
      account: this.account!,
      chain,
      transport: http(this.rpcUrls[chainId]),
    });

    return walletClient.signMessage({
      message,
      account: this.account!,
    });
  }

  async healthCheck(): Promise<boolean> {
    return this.initialized && this.account !== undefined;
  }

  private parseValue(value: string): bigint {
    // If the value looks like a decimal number (e.g., "0.001"), parse as ETH
    if (value.includes(".") || (!value.startsWith("0x") && Number(value) < 1000)) {
      return parseEther(value);
    }
    // Otherwise treat as wei
    return BigInt(value);
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("PrivateKeyProvider not initialized");
    }
  }
}
