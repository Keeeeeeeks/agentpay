import type {
  ProviderConfig,
  SignableTransaction,
  SignedTransaction,
  SigningProvider,
  WalletInfo,
  WalletType,
} from "./interface.js";

interface ParaWalletRecord {
  walletId: string;
  address: string;
  type: WalletType;
}

interface UserShareStore {
  get(walletId: string): Promise<string | null>;
  set(walletId: string, share: string): Promise<void>;
}

/**
 * Para (fka Capsule) signing provider.
 *
 * Uses pregen wallets with server-side MPC signing.
 * The user share must be encrypted at rest — callers provide a UserShareStore
 * that handles encryption/decryption.
 *
 * Supports EVM and Solana chains.
 */
export class ParaProvider implements SigningProvider {
  readonly name = "para";

  private apiBaseUrl = "https://api.beta.getpara.com";
  private apiKey?: string;
  private wallets = new Map<string, ParaWalletRecord>();
  private userShareStore?: UserShareStore;
  private initialized = false;

  setUserShareStore(store: UserShareStore): void {
    this.userShareStore = store;
  }

  async initialize(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error("Para provider requires apiKey");
    }

    this.apiKey = config.apiKey;

    if (config.environment === "production") {
      this.apiBaseUrl = "https://api.getpara.com";
    }

    await this.fetchExistingWallets();
    this.initialized = true;
  }

  async createWallet(type: WalletType, identifier: string): Promise<WalletInfo> {
    this.assertInitialized();

    if (type === "STELLAR") {
      throw new Error("Para does not support Stellar — use PrivyProvider for Stellar");
    }

    const paraType = type === "SOLANA" ? "SOLANA" : "EVM";

    const response = await this.api("POST", "/v1/wallets", {
      type: paraType,
      userIdentifier: identifier,
      userIdentifierType: "EMAIL",
      scheme: "DKLS",
    });

    const wallet: ParaWalletRecord = {
      walletId: response.id as string,
      address: response.address as string,
      type,
    };

    this.wallets.set(wallet.walletId, wallet);

    // Retrieve and store user share for autonomous signing
    const shareResponse = await this.api("GET", `/v1/wallets/${wallet.walletId}/user-share`);
    const userShare = shareResponse.userShare as string;

    if (this.userShareStore) {
      await this.userShareStore.set(wallet.walletId, userShare);
    }

    const chainId = type === "SOLANA" ? "solana-mainnet" : "eip155:1";

    return {
      walletId: wallet.walletId,
      address: wallet.address,
      type,
      chainId,
      provider: this.name,
    };
  }

  async getAddress(chainId: string): Promise<string> {
    this.assertInitialized();

    const walletType = this.chainIdToWalletType(chainId);
    const wallet = this.findWalletByType(walletType);

    if (!wallet) {
      throw new Error(`No ${walletType} wallet found for chain ${chainId}`);
    }

    return wallet.address;
  }

  async listWallets(): Promise<WalletInfo[]> {
    this.assertInitialized();

    return Array.from(this.wallets.values()).map((w) => ({
      walletId: w.walletId,
      address: w.address,
      type: w.type,
      chainId: w.type === "SOLANA" ? "solana-mainnet" : "eip155:1",
      provider: this.name,
    }));
  }

  async signTransaction(tx: SignableTransaction): Promise<SignedTransaction> {
    this.assertInitialized();

    const walletType = this.chainIdToWalletType(tx.chainId);
    const wallet = this.findWalletByType(walletType);

    if (!wallet) {
      throw new Error(`No ${walletType} wallet found`);
    }

    await this.loadUserShare(wallet.walletId);

    const txPayload = this.buildTransactionPayload(tx);

    const response = await this.api("POST", `/v1/wallets/${wallet.walletId}/sign-transaction`, {
      transaction: txPayload,
      chainId: tx.chainId,
    });

    return {
      hash: (response.transactionHash as string) ?? "",
      signedTransaction: response.signedTransaction as string,
    };
  }

  async signMessage(message: string, chainId: string): Promise<string> {
    this.assertInitialized();

    const walletType = this.chainIdToWalletType(chainId);
    const wallet = this.findWalletByType(walletType);

    if (!wallet) {
      throw new Error(`No ${walletType} wallet found`);
    }

    await this.loadUserShare(wallet.walletId);

    const messageBase64 = Buffer.from(message).toString("base64");

    const response = await this.api("POST", `/v1/wallets/${wallet.walletId}/sign-message`, {
      messageBase64,
    });

    return response.signature as string;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      await this.api("GET", "/v1/health");
      return true;
    } catch {
      return false;
    }
  }

  // --- Private ---

  private async fetchExistingWallets(): Promise<void> {
    try {
      const response = await this.api("GET", "/v1/wallets");
      const wallets = (response.wallets ?? response.data ?? []) as Array<{
        id: string;
        address: string;
        type: string;
      }>;

      for (const w of wallets) {
        const type: WalletType = w.type === "SOLANA" ? "SOLANA" : "EVM";
        this.wallets.set(w.id, {
          walletId: w.id,
          address: w.address,
          type,
        });
      }
    } catch {
      // No wallets yet — that's fine
    }
  }

  private async loadUserShare(walletId: string): Promise<void> {
    if (!this.userShareStore) {
      throw new Error("UserShareStore not configured — required for autonomous signing");
    }

    const share = await this.userShareStore.get(walletId);
    if (!share) {
      throw new Error(`No user share found for wallet ${walletId}`);
    }

    await this.api("POST", "/v1/user-share", { userShare: share });
  }

  private findWalletByType(type: WalletType): ParaWalletRecord | undefined {
    return Array.from(this.wallets.values()).find((w) => w.type === type);
  }

  private chainIdToWalletType(chainId: string): WalletType {
    if (chainId.startsWith("solana")) return "SOLANA";
    return "EVM";
  }

  private buildTransactionPayload(tx: SignableTransaction): Record<string, unknown> {
    return {
      to: tx.to,
      value: tx.value,
      data: tx.data ?? "0x",
      chainId: tx.chainId,
      ...(tx.nonce !== undefined && { nonce: tx.nonce }),
      ...(tx.gasLimit && { gasLimit: tx.gasLimit }),
      ...(tx.maxFeePerGas && { maxFeePerGas: tx.maxFeePerGas }),
      ...(tx.maxPriorityFeePerGas && { maxPriorityFeePerGas: tx.maxPriorityFeePerGas }),
    };
  }

  private async api(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.assertInitialized();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey!,
    };

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method,
      headers,
      ...(body && { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Para API ${method} ${path}: ${response.status} — ${text}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("ParaProvider not initialized — call initialize() first");
    }
  }
}
