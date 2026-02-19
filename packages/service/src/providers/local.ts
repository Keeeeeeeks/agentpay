import { nanoid } from "nanoid";

import type {
  ProviderConfig,
  SignableTransaction,
  SignedTransaction,
  SigningProvider,
  WalletInfo,
  WalletType,
} from "./interface.js";

/**
 * In-memory signing provider for development and testing.
 *
 * Generates deterministic fake addresses and returns mock signatures.
 * NEVER use in production.
 */
export class LocalProvider implements SigningProvider {
  readonly name = "local";

  private wallets = new Map<string, WalletInfo>();
  private initialized = false;

  async initialize(_config: ProviderConfig): Promise<void> {
    this.initialized = true;
  }

  async createWallet(type: WalletType, identifier: string): Promise<WalletInfo> {
    this.assertInitialized();

    const walletId = `local_${nanoid(12)}`;
    const address = this.generateAddress(type, identifier);
    const chainId = this.defaultChainId(type);

    const wallet: WalletInfo = {
      walletId,
      address,
      type,
      chainId,
      provider: this.name,
    };

    this.wallets.set(walletId, wallet);
    return wallet;
  }

  async getAddress(chainId: string): Promise<string> {
    this.assertInitialized();

    const type = this.chainIdToType(chainId);
    const wallet = Array.from(this.wallets.values()).find((w) => w.type === type);

    if (!wallet) {
      throw new Error(`No ${type} wallet found for chain ${chainId}`);
    }

    return wallet.address;
  }

  async listWallets(): Promise<WalletInfo[]> {
    return Array.from(this.wallets.values());
  }

  async signTransaction(tx: SignableTransaction): Promise<SignedTransaction> {
    this.assertInitialized();

    const type = this.chainIdToType(tx.chainId);
    const wallet = Array.from(this.wallets.values()).find((w) => w.type === type);

    if (!wallet) {
      throw new Error(`No wallet for chain ${tx.chainId}`);
    }

    const fakeHash = `0x${nanoid(64).replace(/[^0-9a-f]/gi, "0").slice(0, 64)}`;
    const fakeSigned = `0x${nanoid(128).replace(/[^0-9a-f]/gi, "0").slice(0, 128)}`;

    return {
      hash: fakeHash,
      signedTransaction: fakeSigned,
    };
  }

  async signMessage(_message: string, chainId: string): Promise<string> {
    this.assertInitialized();

    const type = this.chainIdToType(chainId);
    const wallet = Array.from(this.wallets.values()).find((w) => w.type === type);

    if (!wallet) {
      throw new Error(`No wallet for chain ${chainId}`);
    }

    return `0x${nanoid(128).replace(/[^0-9a-f]/gi, "0").slice(0, 128)}`;
  }

  async healthCheck(): Promise<boolean> {
    return this.initialized;
  }

  // --- Private ---

  private generateAddress(type: WalletType, identifier: string): string {
    // Deterministic-ish fake addresses for testing
    const seed = Array.from(identifier).reduce((acc, c) => acc + c.charCodeAt(0), 0);

    if (type === "SOLANA") {
      const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
      let addr = "";
      for (let i = 0; i < 44; i++) {
        addr += chars[(seed + i * 7) % chars.length];
      }
      return addr;
    }

    if (type === "STELLAR") {
      return `G${"A".repeat(55).split("").map((_, i) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[(seed + i * 3) % 32]).join("")}`;
    }

    // EVM
    let hex = "";
    for (let i = 0; i < 40; i++) {
      hex += "0123456789abcdef"[(seed + i * 13) % 16];
    }
    return `0x${hex}`;
  }

  private defaultChainId(type: WalletType): string {
    switch (type) {
      case "SOLANA":
        return "solana-mainnet";
      case "STELLAR":
        return "stellar-mainnet";
      default:
        return "eip155:1";
    }
  }

  private chainIdToType(chainId: string): WalletType {
    if (chainId.startsWith("solana")) return "SOLANA";
    if (chainId.startsWith("stellar")) return "STELLAR";
    return "EVM";
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("LocalProvider not initialized");
    }
  }
}
