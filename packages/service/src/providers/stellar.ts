import { nanoid } from "nanoid";
import { Keypair, Networks, Transaction } from "@stellar/stellar-sdk";

import type {
  ProviderConfig,
  SignableTransaction,
  SignedTransaction,
  SigningProvider,
  WalletInfo,
  WalletType,
} from "./interface.js";

interface StellarWalletRecord {
  walletId: string;
  address: string;
  type: WalletType;
}

interface UserShareStore {
  get(walletId: string): Promise<string | null>;
  set(walletId: string, share: string): Promise<void>;
}

export class StellarProvider implements SigningProvider {
  readonly name = "stellar";

  private wallets = new Map<string, StellarWalletRecord>();
  private userShareStore?: UserShareStore;
  private initialized = false;

  setUserShareStore(store: UserShareStore): void {
    this.userShareStore = store;
  }

  async initialize(_config: ProviderConfig): Promise<void> {
    this.initialized = true;
  }

  async createWallet(type: WalletType, _identifier: string): Promise<WalletInfo> {
    this.assertInitialized();

    if (type !== "STELLAR") {
      throw new Error("StellarProvider only supports STELLAR wallets");
    }

    const store = this.getUserShareStore();

    const walletId = `stellar_${nanoid(12)}`;
    const keypair = Keypair.random();

    const wallet: StellarWalletRecord = {
      walletId,
      address: keypair.publicKey(),
      type: "STELLAR",
    };

    this.wallets.set(wallet.walletId, wallet);
    await store.set(wallet.walletId, keypair.secret());

    return {
      walletId: wallet.walletId,
      address: wallet.address,
      type: wallet.type,
      chainId: "stellar-mainnet",
      provider: this.name,
    };
  }

  async getAddress(chainId: string): Promise<string> {
    this.assertInitialized();
    this.chainIdToWalletType(chainId);

    const wallet = this.findWalletByType("STELLAR");

    if (!wallet) {
      throw new Error(`No STELLAR wallet found for chain ${chainId}`);
    }

    return wallet.address;
  }

  async listWallets(): Promise<WalletInfo[]> {
    this.assertInitialized();

    return Array.from(this.wallets.values()).map((w) => ({
      walletId: w.walletId,
      address: w.address,
      type: w.type,
      chainId: "stellar-mainnet",
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

    if (!tx.data) {
      throw new Error("Stellar transaction signing requires tx.data XDR envelope");
    }

    const secret = await this.loadUserShare(wallet.walletId);
    const keypair = Keypair.fromSecret(secret);
    const networkPassphrase = this.networkPassphraseForChainId(tx.chainId);

    const transaction = new Transaction(tx.data, networkPassphrase);
    transaction.sign(keypair);

    return {
      hash: transaction.hash().toString("hex"),
      signedTransaction: transaction.toXDR(),
    };
  }

  async signMessage(message: string, chainId: string): Promise<string> {
    this.assertInitialized();

    const walletType = this.chainIdToWalletType(chainId);
    const wallet = this.findWalletByType(walletType);

    if (!wallet) {
      throw new Error(`No ${walletType} wallet found`);
    }

    const secret = await this.loadUserShare(wallet.walletId);
    const keypair = Keypair.fromSecret(secret);
    const signature = keypair.sign(Buffer.from(message));

    return Buffer.from(signature).toString("hex");
  }

  async healthCheck(): Promise<boolean> {
    return this.initialized;
  }

  private loadUserShareStore(): UserShareStore {
    if (!this.userShareStore) {
      throw new Error("UserShareStore not configured — required for Stellar signing");
    }

    return this.userShareStore;
  }

  private getUserShareStore(): UserShareStore {
    return this.loadUserShareStore();
  }

  private async loadUserShare(walletId: string): Promise<string> {
    const store = this.loadUserShareStore();
    const share = await store.get(walletId);

    if (!share) {
      throw new Error(`No user share found for wallet ${walletId}`);
    }

    return share;
  }

  private findWalletByType(type: WalletType): StellarWalletRecord | undefined {
    return Array.from(this.wallets.values()).find((w) => w.type === type);
  }

  private chainIdToWalletType(chainId: string): WalletType {
    if (chainId.startsWith("stellar")) {
      return "STELLAR";
    }

    throw new Error(`Unsupported chainId for StellarProvider: ${chainId}`);
  }

  private networkPassphraseForChainId(chainId: string): string {
    switch (chainId) {
      case "stellar-mainnet":
        return Networks.PUBLIC;
      case "stellar-testnet":
        return Networks.TESTNET;
      default:
        throw new Error(`Unsupported Stellar chainId: ${chainId}`);
    }
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("StellarProvider not initialized — call initialize() first");
    }
  }
}
