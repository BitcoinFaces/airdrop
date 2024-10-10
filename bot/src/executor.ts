import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import type { StacksNetwork } from "@stacks/network";
import {
    AnchorMode,
    PostConditionMode,
    broadcastTransaction,
    listCV,
    makeContractCall,
    principalCV,
} from "@stacks/transactions";
import type { ListCV } from "@stacks/transactions";
import { getStxAddress } from "@stacks/wallet-sdk";
import { fetchAccountMempoolTransactions, fetchAccountNonces } from "./api";
import type { Signer } from "./signer";
import { retryPromise, sleep, log as mainLogger } from "./utils";

const log = mainLogger.getSubLogger({ name: "Executor" })

export interface ExecutorConfig {
    network: StacksNetwork;
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

        this.address = getStxAddress({
            account: this.signer.getAccount(this.accountId),
            transactionVersion: this.network.version,
        });

        this.fee = cfg.fee;
        this.maxPendingTx = cfg.maxPendingTx;
        if (cfg.batchSize > 14995) {
            log.error("batchSize can't be greater than 14995");
            process.exit(1);
        }
        this.batchSize = cfg.batchSize;

        log.info("EXECUTOR CONFIG");
        log.info(`- Address: ${this.address}`);
        log.info(`- Fee: ${this.fee} uSTX`);
        log.info(`- Batch size: ${this.batchSize} TX`);
    }

    private async refreshNonce() {
        const nonces = await fetchAccountNonces(this.network, this.address);

        if (nonces.possible_next_nonce > this.nonce) {
            this.nonce = nonces.possible_next_nonce;
        }

        if (nonces.detected_missing_nonces.length > 0) {
            this.hasMissingNonce = true;
            log.warn("Detected missing nonces");
            log.warn(nonces.detected_missing_nonces);

            for (const missing_nonce of nonces.detected_missing_nonces) {
                if (missing_nonce < this.nonce) {
                    this.nonce = missing_nonce;
                }
            }
        } else {
            this.hasMissingNonce = false;
        }
    }

    private async refreshPendingTx() {
        const pendingTxs = await fetchAccountMempoolTransactions(
            this.network,
            this.address,
        );
        this.pendingTxs = pendingTxs.total;
    }

    private async createTransaction(newBatch: {
        l1: ListCV;
        l2: ListCV;
        l3: ListCV;
    }) {
        const newTransaction = makeContractCall({
            network: this.network,
            contractAddress: this.address,
            contractName: "bitcoin-faces-airdrop",
            functionName: "airdrop",
            functionArgs: [newBatch.l1, newBatch.l2, newBatch.l3],
            postConditionMode: PostConditionMode.Deny,
            anchorMode: AnchorMode.Any,
            senderKey: this.signer.getAccount(this.accountId).stxPrivateKey,
            fee: this.fee,
            nonce: this.nonce,
        });

        return newTransaction;
    }

    async run(overrideNonce = -1) {
        await this.refreshPendingTx();
        if (overrideNonce !== -1) {
            log.info(`- Using custom nonce: ${overrideNonce}`);
            this.nonce = BigInt(overrideNonce);
        } else {
            await this.refreshNonce();
        }

        log.info(`- Pending TX: ${this.pendingTxs}`);
        log.info(`- Next nonce: ${this.nonce}`);

        log.info("STARTING AIRDROP LOOP");
        if (this.pendingTxs >= this.maxPendingTx) {
            log.debug("- Max pending transactions reached, waiting for next block...");
            return;
        }
        while (this.pendingTxs < this.maxPendingTx || this.hasMissingNonce || overrideNonce !== -1) {
            log.info("- Preparing new batch");
            const newBatch = await getNextBatch(this.batchSize);

            if (newBatch.total === 0) {
                log.info("AIRDROP COMPLETE!");
                break;
            }

            const newTransaction = await this.createTransaction(newBatch.lists);

            log.info("- Sending new transaction...");
            // log.info("- Pausing for 30sec...");
            // await sleep(30000);
            const result = await retryPromise(
                broadcastTransaction(newTransaction, this.network),
            );

            log.info(`- TXID: ${result.txid}`);

            if (typeof result.error === "string") {
                log.error(
                    `Failed to broadcast TX ${newTransaction.txid()} due to: ${result.error} because ${result.reason}`,
                );
                log.error("Will try again in 60s");

                await sleep(60000);
            } else {
                log.info("- Updating source.csv and done.csv files...");
                await writeDone(newBatch.done);

                await writeSource(newBatch.pending);
                await sleep(3000);
                await this.refreshPendingTx();
                await this.refreshNonce();
            }
        }
    }
}

async function readSource(maxLines: number) {
    const filePath = path.resolve(__dirname, "../files/source.csv");

    const lineReader = readline.createInterface({
        input: fs.createReadStream(filePath),
    });

    const lines = [];
    for await (const line of lineReader) {
        lines.push(line);
    }
    lineReader.close();
    log.info(`- Read ${lines.length} addresses from source file`);

    return lines;
}

async function writeSource(data: string[]) {
    const filePath = path.resolve(__dirname, "../files/source.csv");
    const file = fs.createWriteStream(filePath);

    for (const line of data) {
        file.write(`${line}\n`);
    }
    file.end();
}

async function writeDone(data: string[]) {
    const filePath = path.resolve(__dirname, "../files/done.csv");
    const file = fs.createWriteStream(filePath, { flags: "a" });

    for (const line of data) {
        file.write(`${line}\n`);
    }
    file.end();
}

async function getNextBatch(size: number) {
    const l1 = [];
    const l2 = [];
    const l3 = [];

    let count = 0;

    const pending = await readSource(size);
    const done = [];

    for (let i = 0; i < 5000; i++) {
        if (count < size && pending.length > 0) {
            const address = pending.shift();

            if (typeof address === "string") {
                l1[i] = principalCV(address);
                done.push(address);
                count++;
            }
        }
    }

    for (let i = 0; i < 5000; i++) {
        if (count < size && pending.length > 0) {
            const address = pending.shift();

            if (typeof address === "string") {
                l2[i] = principalCV(address);
                done.push(address);
                count++;
            }
        }
    }

    for (let i = 0; i < 4995; i++) {
        if (count < size && pending.length > 0) {
            const address = pending.shift();

            if (typeof address === "string") {
                l3[i] = principalCV(address);
                done.push(address);
                count++;
            }
        }
    }

    log.info(
        `- New Batch: L1: ${l1.length}, L2: ${l2.length}, L3: ${l3.length}`,
    );

    return {
        lists: { l1: listCV(l1), l2: listCV(l2), l3: listCV(l3) },
        total: l1.length + l2.length + l3.length,
        done: done,
        pending: pending,
    };
}
