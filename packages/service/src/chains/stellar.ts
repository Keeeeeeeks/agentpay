import { createHash } from "node:crypto"
import {
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
  type xdr,
  Address,
} from "@stellar/stellar-sdk"
import {
  Server as SorobanRpcServer,
  assembleTransaction,
} from "@stellar/stellar-sdk/rpc"

import type {
  ChainAdapter,
  GasEstimate,
  TokenBalance,
  TransactionInfo,
  TransactionReceipt,
  UnsignedTransaction,
} from "./interface.js"

export interface StellarChainConfig {
  chainId: string;
  horizonUrl?: string;
  sorobanRpcUrl?: string;
}

export interface SorobanInvokeParams {
  contractId: string;
  method: string;
  args: any[];
  sourcePublicKey: string;
}

export interface SorobanInvokeResult {
  transaction: any;
  simulationResult: any;
}

export interface SorobanDeployParams {
  wasm: Buffer;
  sourcePublicKey: string;
  salt?: Buffer;
}

export interface SorobanDeployResult {
  transaction: any;
  wasmHash: string;
}

const DEFAULT_HORIZON_RPC: Record<string, string> = {
  "stellar-mainnet": "https://horizon.stellar.org",
  "stellar-testnet": "https://horizon-testnet.stellar.org",
  "stellar-futurenet": "https://horizon-futurenet.stellar.org",
}

const DEFAULT_SOROBAN_RPC: Record<string, string> = {
  "stellar-mainnet": "https://soroban-rpc.mainnet.stellar.gateway.fm",
  "stellar-testnet": "https://soroban-testnet.stellar.org",
  "stellar-futurenet": "https://rpc-futurenet.stellar.org",
}

const NETWORK_PASSPHRASE: Record<string, string> = {
  "stellar-mainnet": Networks.PUBLIC,
  "stellar-testnet": Networks.TESTNET,
  "stellar-futurenet": Networks.FUTURENET,
}

const DISPLAY_NAME: Record<string, string> = {
  "stellar-mainnet": "Stellar",
  "stellar-testnet": "Stellar Testnet",
  "stellar-futurenet": "Stellar Futurenet",
}

export class StellarChainAdapter implements ChainAdapter {
  readonly chainType = "stellar" as const
  readonly chainId: string
  readonly displayName: string
  readonly nativeToken = { symbol: "XLM", decimals: 7 }

  private horizonServer: Horizon.Server
  private sorobanServer: SorobanRpcServer
  private networkPassphrase: string

  constructor(config: StellarChainConfig) {
    this.chainId = config.chainId

    if (!(this.chainId in NETWORK_PASSPHRASE)) {
      throw new Error(`Unsupported Stellar chain: ${this.chainId}`)
    }

    this.displayName = DISPLAY_NAME[this.chainId]!
    this.networkPassphrase = NETWORK_PASSPHRASE[this.chainId]!

    const horizonUrl = config.horizonUrl ?? DEFAULT_HORIZON_RPC[this.chainId]!
    const sorobanRpcUrl = config.sorobanRpcUrl ?? DEFAULT_SOROBAN_RPC[this.chainId]!

    this.horizonServer = new Horizon.Server(horizonUrl)
    this.sorobanServer = new SorobanRpcServer(sorobanRpcUrl)
  }

  async getBalance(address: string): Promise<TokenBalance> {
    this.validatePublicKey(address)

    const account = await this.horizonServer.accounts().accountId(address).call()
    const nativeBalance = account.balances.find((entry) => entry.asset_type === "native")
    const nativeAsset = Asset.native()

    return {
      symbol: nativeAsset.getCode(),
      name: "Stellar",
      address: "native",
      balance: nativeBalance?.balance ?? "0",
      decimals: this.nativeToken.decimals,
    }
  }

  async getTokenBalances(_address: string): Promise<TokenBalance[]> {
    return []
  }

  async getTransaction(hash: string): Promise<TransactionInfo | null> {
    try {
      const tx = await this.horizonServer.transactions().transaction(hash).call()

      return {
        hash,
        from: tx.source_account,
        to: tx.fee_account,
        value: "0",
        status: tx.successful ? "confirmed" : "failed",
        timestamp: Math.floor(new Date(tx.created_at).getTime() / 1000),
      }
    } catch {
      return null
    }
  }

  async broadcastTransaction(signedTx: string): Promise<string> {
    const tx = new Transaction(signedTx, this.networkPassphrase)
    const response = await this.sorobanServer.sendTransaction(tx)

    if (response.status === "ERROR") {
      throw new Error(`Stellar transaction rejected: ${response.hash}`)
    }

    return response.hash
  }

  async waitForConfirmation(hash: string, timeoutMs = 60_000): Promise<TransactionReceipt> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      const txResponse = await this.sorobanServer.getTransaction(hash)

      if (txResponse.status === "SUCCESS") {
        return {
          hash,
          status: "confirmed",
          blockNumber: txResponse.ledger,
        }
      }

      if (txResponse.status === "FAILED") {
        return {
          hash,
          status: "failed",
          blockNumber: txResponse.ledger,
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    throw new Error(`Stellar transaction ${hash} confirmation timeout after ${timeoutMs}ms`)
  }

  async estimateGas(_tx: UnsignedTransaction): Promise<GasEstimate> {
    try {
      const feeStats = await this.sorobanServer.getFeeStats()

      return {
        gasLimit: "1",
        gasPriceGwei: feeStats.sorobanInclusionFee.p50,
        maxFeePerGas: feeStats.sorobanInclusionFee.p95,
        maxPriorityFeePerGas: feeStats.inclusionFee.p50,
      }
    } catch {
      return {
        gasLimit: "1",
        gasPriceGwei: BASE_FEE.toString(),
        maxFeePerGas: BASE_FEE.toString(),
      }
    }
  }

  async getNonce(address: string): Promise<number> {
    this.validatePublicKey(address)
    const account = await this.horizonServer.accounts().accountId(address).call()
    return Number.parseInt(account.sequence, 10)
  }

  async invokeContract(params: SorobanInvokeParams): Promise<SorobanInvokeResult> {
    this.validatePublicKey(params.sourcePublicKey)
    const account = await this.sorobanServer.getAccount(params.sourcePublicKey)
    const contract = new Contract(params.contractId)
    const args = params.args as xdr.ScVal[]

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE.toString(),
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(params.method, ...args))
      .setTimeout(30)
      .build()

    const simulationResult = await this.sorobanServer.simulateTransaction(transaction)
    const assembledTransaction = assembleTransaction(transaction, simulationResult).build()

    return {
      transaction: assembledTransaction,
      simulationResult,
    }
  }

  async deployContract(params: SorobanDeployParams): Promise<SorobanDeployResult> {
    this.validatePublicKey(params.sourcePublicKey)
    const account = await this.sorobanServer.getAccount(params.sourcePublicKey)
    const wasmHash = createHash("sha256").update(params.wasm).digest()
    const salt = params.salt ?? Keypair.random().rawPublicKey()
    const sourceAddress = Address.fromString(params.sourcePublicKey)

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE.toString(),
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(Operation.uploadContractWasm({ wasm: params.wasm }))
      .addOperation(
        Operation.createCustomContract({
          address: sourceAddress,
          wasmHash,
          salt,
        }),
      )
      .setTimeout(30)
      .build()

    const simulationResult = await this.sorobanServer.simulateTransaction(transaction)
    const assembledTransaction = assembleTransaction(transaction, simulationResult).build()

    return {
      transaction: assembledTransaction,
      wasmHash: wasmHash.toString("hex"),
    }
  }

  private validatePublicKey(publicKey: string): void {
    Keypair.fromPublicKey(publicKey)
  }
}
