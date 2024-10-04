import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { StacksNetwork } from "@stacks/network";
import { Signer } from "./signer";
import { getStxAddress } from "@stacks/wallet-sdk";
import { retryPromise, sleep } from "./utils";
import { AnchorMode, broadcastTransaction, ListCV, listCV, makeContractCall, PostConditionMode, principalCV, UIntCV } from "@stacks/transactions";
import { fetchAccountMempoolTransactions, fetchAccountNonces } from "./api";

export interface ExecutorConfig {
    network: StacksNetwork,
    signer: Signer;
    accountId: number;
    fee: number;
    maxPendingTx: number;
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
    private hasMissingNonce = false;


    constructor(cfg: ExecutorConfig) {
        this.signer = cfg.signer;
        this.accountId = cfg.accountId;
        this.network = cfg.network;

        this.address = getStxAddress({ account: this.signer.getAccount(this.accountId), transactionVersion: this.network.version });

        this.fee = cfg.fee;
        this.maxPendingTx = cfg.maxPendingTx;
        if (cfg.batchSize > 14995) {
            console.error("batchSize can't be greater than 14995");
            process.exit(1);
        }
        this.batchSize = cfg.batchSize

        console.info("EXECUTOR CONFIG")
        console.info(`- Address: ${this.address}`)
        console.info(`- Fee: ${this.fee} uSTX`)
        console.info(`- Batch size: ${this.batchSize} TX`)
    }

    private async refreshNonce() {
        const nonces = await fetchAccountNonces(this.network, this.address);

        if (nonces.possible_next_nonce > this.nonce) {
            this.nonce = nonces.possible_next_nonce;
        }

        if (nonces.detected_missing_nonces.length > 0) {
            this.hasMissingNonce = true;
            console.warn("Detected missing nonces");
            console.table(nonces.detected_missing_nonces);

            nonces.detected_missing_nonces.forEach((missing_nonce: bigint) => {
                if (missing_nonce < this.nonce) {
                    this.nonce = missing_nonce;
                }
            });
        } else {
            this.hasMissingNonce = false;
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

        console.info(`- Pending TX: ${this.pendingTxs}`)
        console.info(`- Next nonce: ${this.nonce}`)
        
        console.info("STARTING AIRDROP LOOP");
        while (this.pendingTxs < this.maxPendingTx || this.hasMissingNonce) {
            console.info("Preparing new batch")
            const newBatch = await getNextBatch(this.batchSize)

            if (newBatch.total === 0) {
                console.info("AIRDROP COMPLETE!");
                break;
            }

            const newTransaction = await this.createTransaction(newBatch);

            console.info("- Sending new transaction...")
            const result = await retryPromise(broadcastTransaction(newTransaction, this.network));
            console.info(`- TXID: ${result.txid}`)

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
    console.info(`- Read ${lines.length} addresses from source file`)

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

    console.info(`- New Batch: L1: ${l1.length}, L2: ${l2.length}, L3: ${l3.length}`)

    return { l1: listCV(l1), l2: listCV(l2), l3: listCV(l3), total: l1.length + l2.length + l3.length }
}

