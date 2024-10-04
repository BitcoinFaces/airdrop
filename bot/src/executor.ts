import { StacksNetwork } from "@stacks/network";
import { Signer } from "./signer";
import { getStxAddress } from "@stacks/wallet-sdk";
import { retryPromise, sleep } from "./utils";
import { AnchorMode, broadcastTransaction, getNonce, listCV, makeContractCall, PostConditionMode, principalCV } from "@stacks/transactions";
import { fetchAccountMempoolTransactions } from "./api";

export interface ExecutorConfig {
    network: StacksNetwork,
    signer: Signer;
    accountId: number;
    fee: number;
    maxPendigTx: number;
}

export class Executor {
    private signer: Signer;
    private accountId: number;
    private address: string;
    private network: StacksNetwork;
    private nonce: bigint = BigInt(-1);
    private fee: number;
    private maxPendingTx: number;
    private pendingTxs = 0;


    constructor(cfg: ExecutorConfig) {
        this.signer = cfg.signer;
        this.accountId = cfg.accountId;
        this.network = cfg.network;

        this.address = getStxAddress({ account: this.signer.getAccount(this.accountId), transactionVersion: this.network.version });

        this.fee = cfg.fee;
        this.maxPendingTx = cfg.maxPendigTx;

        console.info(
            `Executor will use: ${this.address}, fee: ${this.fee} uSTX`
        );
    }

    private async refreshNonce() {
        const nonce = await retryPromise(
            getNonce(this.address, this.network)
        );

        if (nonce > this.nonce) {
            this.nonce = nonce;
        }
    }

    private async refreshPendingTx() {
        const pendingTxs = await fetchAccountMempoolTransactions(this.network, this.address);
        this.pendingTxs = pendingTxs.total;
    }

    private async createTransaction() {
        const newTransaction = makeContractCall({
            network: this.network,
            contractAddress: this.address,
            contractName: "nft",
            functionName: "airdrop",
            functionArgs: [
                listCV([principalCV(this.address), principalCV(this.address), principalCV(this.address)]),
                listCV([]),
                listCV([])
            ],
            postConditionMode: PostConditionMode.Deny,
            anchorMode: AnchorMode.Any,
            senderKey: this.signer.getAccount(this.accountId).stxPrivateKey,
            fee: this.fee,
            nonce: this.nonce,
        })

        return newTransaction
    }

    async run() {
        await this.refreshPendingTx();
        await this.refreshNonce();

        console.info(`${this.address}: ${this.pendingTxs} pending TX, next nonce: ${this.nonce}`)

        while (this.pendingTxs < this.maxPendingTx) {
            console.info("Sending new transaction...")

            const newTransaction = await this.createTransaction();
            const result = await retryPromise(
                broadcastTransaction(newTransaction, this.network)
            );

            await sleep(3000);
            await this.refreshPendingTx();
            await this.refreshNonce();
        }
    }
}



