export type WalletType = "EVM" | "SOLANA" | "STELLAR";

export interface WalletInfo {
  walletId: string;
  address: string;
  type: WalletType;
  chainId: string;
  provider: string;
}

export interface SignableTransaction {
  chainId: string;
  to: string;
  value: string;
  data?: string;
  nonce?: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface SignedTransaction {
  hash: string;
  signedTransaction: string;
}

export interface ProviderConfig {
  apiKey?: string;
  apiSecret?: string;
  apiPublicKey?: string;
  apiPrivateKey?: string;
  organizationId?: string;
  environment: "production" | "sandbox";
  [key: string]: unknown;
}

export interface SigningProvider {
  readonly name: string;
  initialize(config: ProviderConfig): Promise<void>;
  createWallet(type: WalletType, identifier: string): Promise<WalletInfo>;
  getAddress(chainId: string): Promise<string>;
  listWallets(): Promise<WalletInfo[]>;
  signTransaction(tx: SignableTransaction): Promise<SignedTransaction>;
  signMessage(message: string, chainId: string): Promise<string>;
  healthCheck(): Promise<boolean>;
}
