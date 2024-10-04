import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { StacksNetwork } from "@stacks/network";
import { Signer } from "./signer";
import { getStxAddress } from "@stacks/wallet-sdk";
import { retryPromise, sleep } from "./utils";
import { AnchorMode, broadcastTransaction, callReadOnlyFunction, cvToValue, getNonce, ListCV, listCV, makeContractCall, PostConditionMode, principalCV, UIntCV } from "@stacks/transactions";
import { fetchAccountMempoolTransactions } from "./api";

export interface ExecutorConfig {
    network: StacksNetwork,
    signer: Signer;
    accountId: number;
    fee: number;
    maxPendigTx: number;
    batchSize: number;
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
    private batchSize: number;


    constructor(cfg: ExecutorConfig) {
        this.signer = cfg.signer;
        this.accountId = cfg.accountId;
        this.network = cfg.network;

        this.address = getStxAddress({ account: this.signer.getAccount(this.accountId), transactionVersion: this.network.version });

        this.fee = cfg.fee;
        this.maxPendingTx = cfg.maxPendigTx;
        this.batchSize = cfg.batchSize

        console.info(
            `Executor will use: ${this.address}, fee: ${this.fee} uSTX, batchSize: ${this.batchSize}`
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

    private async createTransaction(newBatch: { l1: ListCV, l2: ListCV, l3: ListCV }) {
        const newTransaction = makeContractCall({
            network: this.network,
            contractAddress: this.address,
            contractName: "nft",
            functionName: "airdrop",
            functionArgs: [newBatch.l1, newBatch.l2, newBatch.l3],
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
            console.info("Preparing new batch")
            const newBatch = await getNextBatch(this.batchSize)

            if (newBatch.total === 0) {
                console.info("DONE!!!");
                break;
            }

            const newTransaction = await this.createTransaction(newBatch);

            console.info("Sending new transaction...")
            const result = await retryPromise(
                broadcastTransaction(newTransaction, this.network)
            );

            await sleep(3000);
            await this.refreshPendingTx();
            await this.refreshNonce();
        }
    }
}

async function readSource() {
    const filePath = path.resolve(__dirname, '../files/source.csv');

    const lineReader = readline.createInterface({
        input: fs.createReadStream(filePath)
    });

    let lines = [];
    for await (const line of lineReader) {
        lines.push(line)
    }

    return lines
}

async function writeSource(data: string[]) {
    const filePath = path.resolve(__dirname, '../files/source.csv');
    const file = fs.createWriteStream(filePath);

    data.forEach(line => { file.write(`${line}\n`) });
    file.end();
}

async function writeDone(data: string[]) {
    const filePath = path.resolve(__dirname, '../files/done.csv');
    const file = fs.createWriteStream(filePath, { flags: 'a' });

    data.forEach(line => { file.write(`${line}\n`) });
    file.end();
}

async function getNextBatch(size: number) {
    let l1 = [];
    let l2 = [];
    let l3 = [];

    let count = 0;

    let pending = await readSource();
    let done = []

    for (var i = 0; i < 5000; i++) {
        if (count < size && pending.length > 0) {
            const address = pending.shift()

            if (typeof address == "string") {
                l1[i] = principalCV(address);
                done.push(address);
                count++;
            }
        }
    }

    for (var i = 0; i < 5000; i++) {
        if (count < size && pending.length > 0) {
            const address = pending.shift()

            if (typeof address == "string") {
                l2[i] = principalCV(address);
                done.push(address);
                count++;
            }
        }
    }

    for (var i = 0; i < 4995; i++) {
        if (count < size && pending.length > 0) {
            const address = pending.shift()

            if (typeof address == "string") {
                l3[i] = principalCV(address);
                done.push(address);
                count++;
            }
        }
    }

    await writeDone(done);
    await writeSource(pending);

    console.info(`New Batch: L1: ${l1.length}, L2: ${l2.length}, L3: ${l3.length}`)

    return { l1: listCV(l1), l2: listCV(l2), l3: listCV(l3), total: l1.length + l2.length + l3.length }
}

