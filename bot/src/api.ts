import type { StacksNetwork } from "@stacks/network";
import type {
    AddressStxBalanceResponse,
    AddressTransactionWithTransfers,
    Block,
    MempoolTransaction,
    Microblock,
    NftEvent,
    Transaction,
} from "@stacks/stacks-blockchain-api-types";
import { type Socket, io } from "socket.io-client";
import { log as mainLogger } from "./utils";

const log = mainLogger.getSubLogger({ name: "API" });

export class Api {
    private socket: Socket;
    private logEvents = false;
    // biome-ignore lint/suspicious/noExplicitAny:
    private subscriptions = new Map<string, Set<(...args: any[]) => void>>();

    constructor(network: StacksNetwork) {
        const socket = io(network.coreApiUrl, {
            autoConnect: true,
            retries: 20,
            transports: ["websocket"],
        });

        socket.on("connect", () => {
            log.debug("Socket connected");

            if (this.subscriptions.size > 0 && !socket.recovered) {
                for (const [topic, _listeners] of this.subscriptions) {
                    log.trace(`Creating new subscription to ${topic} events`);
                    socket.emit("subscribe", topic);
                }
            }
        });

        socket.on("connect_error", (error) => {
            log.error("Failed to connect");
            log.error(error);
        });

        socket.on("disconnect", () => {
            log.debug("Socket disconnected");
        });

        socket.io.on("reconnect_attempt", (attempt) => {
            log.debug(`Socket reconnecting attempt: ${attempt}`);
        });

        socket.io.on("reconnect_error", (error) => {
            log.error("Failed to reconnect");
            log.error(error);
        });

        socket.on("reconnect", (attempt) => {
            log.debug(`Socket reconnected after ${attempt} attempts`);
        });

        socket.on("error", (error) => {
            log.error("Socket error");
            log.error(error);
        });

        this.socket = socket;
    }

    toggleLogEvents() {
        this.logEvents = !this.logEvents;

        if (this.logEvents) {
            this.socket.onAny((event: string, _) => {
                log.debug(`New ${event} event`);
            });
        } else {
            this.socket.offAny();
        }
    }

    // biome-ignore lint/suspicious/noExplicitAny:
    private subscribe(topic: string, listener: (...args: any[]) => void) {
        log.debug("Subscribing", topic, listener);
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, new Set());
        }
        const subscriptions = this.subscriptions.get(topic);
        subscriptions?.add(listener);

        if (this.socket.connected) {
            log.debug(`Subscribing to ${topic} events`);
            this.socket.emit("subscribe", [topic]);
        }

        this.socket.on(topic, listener);

        return () => {
            this.unsubscribe(topic, listener);
        };
    }

    // biome-ignore lint/suspicious/noExplicitAny: reason
    private unsubscribe(topic: string, listener: (...args: any[]) => void) {
        log.debug("Unsubscribing", topic, listener);
        if (this.subscriptions.has(topic)) {
            const topicListeners = this.subscriptions.get(topic);

            if (topicListeners?.has(listener)) {
                topicListeners?.delete(listener);
                this.socket.off(topic, listener);
            } else {
                log.warn("Unknown listener");
            }

            if (topicListeners?.size === 0) {
                log.trace(
                    `No more listeners listening to ${topic} events. Unsubscribing.`,
                );
                this.socket.emit("unsubscribe", topic);
                this.subscriptions.delete(topic);
            }
        }
    }

    subscribeMempool(listener: (tx: MempoolTransaction) => void) {
        return this.subscribe("mempool", listener);
    }

    subscribeBlocks(listener: (block: Block) => void) {
        return this.subscribe("block", listener);
    }

    subscribeMicroBlocks(listener: (microblock: Microblock) => void) {
        return this.subscribe("microblock", listener);
    }

    subscribeAddressTransactions(
        address: string,
        listener: (tx: AddressTransactionWithTransfers) => void,
    ) {
        return this.subscribe(`address-transaction:${address}`, listener);
    }

    subscribeAddressStxBalance(
        address: string,
        listener: (address: string, stxBalance: AddressStxBalanceResponse) => void,
    ) {
        return this.subscribe(`address-stx-balance:${address}`, listener);
    }

    subscribeTransaction(
        txId: string,
        listener: (tx: MempoolTransaction | Transaction) => void,
    ) {
        return this.subscribe(`transaction:${txId}`, listener);
    }

    subscribeNftEvent(listener: (event: NftEvent) => void) {
        return this.subscribe("nft-event", listener);
    }

    subscribeNftAssetEvent(
        assetIdentifier: string,
        value: string,
        listener: (assetIdentifier: string, value: string, event: NftEvent) => void,
    ) {
        return this.subscribe(
            `nft-asset-event:${assetIdentifier}+${value}`,
            listener,
        );
    }

    subscribeNftCollectionEvent(
        assetIdentifier: string,
        listener: (assetIdentifier: string, event: NftEvent) => void,
    ) {
        return this.subscribe(`nft-collection-event:${assetIdentifier}`, listener);
    }
}


export async function fetchAccountMempoolTransactions(
    network: StacksNetwork,
    address: string,
    limit: number | number = 25,
    offset: number | number = 0,
) {
    const url = `${network.coreApiUrl}/extended/v1/tx/mempool?sender_address=${address}&limit=${limit}&offset=${offset}`;
    const requestHeaders: HeadersInit = new Headers();
    requestHeaders.set("Content-Type", "application/json");

    const response = await fetch(url, { headers: requestHeaders, method: "GET" });
    const json = await response.json();

    return json;
}

export async function fetchAccountNonces(
    network: StacksNetwork,
    address: string,
) {
    const url = `${network.coreApiUrl}/extended/v1/address/${address}/nonces`;

    const requestHeaders: HeadersInit = new Headers();
    requestHeaders.set("Content-Type", "application/json");

    const response = await fetch(url, { headers: requestHeaders, method: "GET" });
    const json = await response.json();

    return json;
}
