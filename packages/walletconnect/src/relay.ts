import { Core } from "@walletconnect/core";
import { Web3Wallet } from "@walletconnect/web3wallet";
import type { SessionTypes } from "@walletconnect/types";
import type { Web3WalletTypes } from "@walletconnect/web3wallet";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";

const EVM_NAMESPACE = "eip155";

const SUPPORTED_METHODS = [
  "eth_sendTransaction",
  "eth_signTransaction",
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
];

const SUPPORTED_EVENTS = ["chainChanged", "accountsChanged"];

export interface WalletConnectConfig {
  projectId: string;
  metadata: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
}

export interface SigningRelay {
  getAddress(chainId: string): Promise<string>;
  signTransaction(params: {
    chainId: string;
    to: string;
    value: string;
    data?: string;
  }): Promise<{ hash: string; signedTransaction: string }>;
  signMessage(message: string, chainId: string): Promise<string>;
  signTypedData(data: string, chainId: string): Promise<string>;
  getSupportedChains(): string[];
}

interface TransactionRequestParams {
  to: string;
  value: string;
  data?: string;
}

export class AgentPayWalletConnect {
  private wallet: InstanceType<typeof Web3Wallet> | null = null;
  private activeSessions = new Map<string, SessionTypes.Struct>();

  public constructor(
    private readonly config: WalletConnectConfig,
    private readonly relay: SigningRelay,
  ) {}

  public async initialize(): Promise<void> {
    const core = new Core({ projectId: this.config.projectId });
    this.wallet = await Web3Wallet.init({
      core,
      metadata: this.config.metadata,
    });

    this.wallet.on("session_proposal", async (proposal) => {
      await this.handleSessionProposal(proposal);
    });

    this.wallet.on("session_request", async (event) => {
      await this.handleSessionRequest(event);
    });

    this.wallet.on("session_delete", (event) => {
      this.activeSessions.delete(event.topic);
    });

    for (const session of Object.values(this.wallet.getActiveSessions())) {
      this.activeSessions.set(session.topic, session);
    }
  }

  public async pair(uri: string): Promise<void> {
    const wallet = this.getWalletOrThrow();
    await wallet.pair({ uri });
  }

  public async disconnect(topic: string): Promise<void> {
    const wallet = this.getWalletOrThrow();
    await wallet.disconnectSession({
      topic,
      reason: getSdkError("USER_DISCONNECTED"),
    });
    this.activeSessions.delete(topic);
  }

  public getActiveSessions(): SessionTypes.Struct[] {
    return Array.from(this.activeSessions.values());
  }

  private getWalletOrThrow(): InstanceType<typeof Web3Wallet> {
    if (!this.wallet) {
      throw new Error("WalletConnect wallet is not initialized");
    }

    return this.wallet;
  }

  private async handleSessionProposal(
    proposal: Web3WalletTypes.SessionProposal,
  ): Promise<void> {
    const wallet = this.getWalletOrThrow();

    try {
      const supportedChains = this.relay
        .getSupportedChains()
        .filter((chainId) => chainId.startsWith(`${EVM_NAMESPACE}:`));

      const accounts: string[] = [];
      for (const chainId of supportedChains) {
        const address = await this.relay.getAddress(chainId);
        accounts.push(`${chainId}:${address}`);
      }

      const namespaces = buildApprovedNamespaces({
        proposal: proposal.params,
        supportedNamespaces: {
          [EVM_NAMESPACE]: {
            chains: supportedChains,
            methods: SUPPORTED_METHODS,
            events: SUPPORTED_EVENTS,
            accounts,
          },
        },
      });

      await wallet.approveSession({
        id: proposal.id,
        namespaces,
      });

      for (const session of Object.values(wallet.getActiveSessions())) {
        this.activeSessions.set(session.topic, session);
      }
    } catch {
      await wallet.rejectSession({
        id: proposal.id,
        reason: getSdkError("USER_REJECTED"),
      });
    }
  }

  private async handleSessionRequest(
    event: Web3WalletTypes.SessionRequest,
  ): Promise<void> {
    const wallet = this.getWalletOrThrow();
    const { topic, id, params } = event;
    const { request, chainId } = params;

    try {
      const result = await this.executeSessionRequest(request.method, request.params, chainId);
      await wallet.respondSessionRequest({
        topic,
        response: {
          id,
          jsonrpc: "2.0",
          result,
        },
      });
    } catch {
      await wallet.respondSessionRequest({
        topic,
        response: {
          id,
          jsonrpc: "2.0",
          error: getSdkError("USER_REJECTED"),
        },
      });
    }
  }

  private async executeSessionRequest(
    method: string,
    rawParams: unknown,
    chainId: string,
  ): Promise<string> {
    switch (method) {
      case "eth_sendTransaction": {
        const tx = this.extractTransaction(rawParams);
        const signed = await this.relay.signTransaction({
          chainId,
          to: tx.to,
          value: tx.value,
          data: tx.data,
        });
        return signed.hash;
      }

      case "eth_signTransaction": {
        const tx = this.extractTransaction(rawParams);
        const signed = await this.relay.signTransaction({
          chainId,
          to: tx.to,
          value: tx.value,
          data: tx.data,
        });
        return signed.signedTransaction;
      }

      case "personal_sign":
      case "eth_sign": {
        const message = this.extractSignMessage(rawParams);
        return this.relay.signMessage(message, chainId);
      }

      case "eth_signTypedData":
      case "eth_signTypedData_v4": {
        const data = this.extractTypedData(rawParams);
        return this.relay.signTypedData(data, chainId);
      }

      default:
        throw new Error(`Unsupported WalletConnect request method: ${method}`);
    }
  }

  private extractTransaction(rawParams: unknown): TransactionRequestParams {
    if (!Array.isArray(rawParams) || rawParams.length === 0) {
      throw new Error("Transaction parameters are missing");
    }

    const tx = rawParams[0];
    if (!tx || typeof tx !== "object") {
      throw new Error("Invalid transaction payload");
    }

    const txRecord = tx as Record<string, unknown>;
    const to = txRecord["to"];
    const value = txRecord["value"];
    const data = txRecord["data"];

    if (typeof to !== "string") {
      throw new Error("Transaction 'to' must be a string");
    }

    if (typeof value !== "string") {
      throw new Error("Transaction 'value' must be a string");
    }

    if (data !== undefined && typeof data !== "string") {
      throw new Error("Transaction 'data' must be a string when present");
    }

    return { to, value, data };
  }

  private extractSignMessage(rawParams: unknown): string {
    if (!Array.isArray(rawParams) || rawParams.length < 1) {
      throw new Error("Message signing parameters are missing");
    }

    const first = rawParams[0];
    const second = rawParams.length > 1 ? rawParams[1] : undefined;

    if (typeof first === "string" && first.startsWith("0x") && typeof second === "string") {
      return second;
    }

    if (typeof first === "string") {
      return first;
    }

    if (typeof second === "string") {
      return second;
    }

    throw new Error("Unable to extract signable message");
  }

  private extractTypedData(rawParams: unknown): string {
    if (!Array.isArray(rawParams) || rawParams.length === 0) {
      throw new Error("Typed-data parameters are missing");
    }

    const typedData = rawParams.length > 1 ? rawParams[1] : rawParams[0];

    if (typeof typedData === "string") {
      return typedData;
    }

    if (typedData && typeof typedData === "object") {
      return JSON.stringify(typedData);
    }

    throw new Error("Unable to extract typed-data payload");
  }
}
