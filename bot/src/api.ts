import { StacksApiSocketClient } from "@stacks/blockchain-api-client";
import type { StacksNetwork } from "@stacks/network";
import type {
	AddressTransactionWithTransfers,
	Block,
	MempoolTransaction,
	Transaction,
} from "@stacks/stacks-blockchain-api-types";

export class Api {
	private client: StacksApiSocketClient;

	constructor(network: StacksNetwork) {
		this.client = new StacksApiSocketClient({
			url: network.coreApiUrl,
			socketOpts: { autoConnect: true },
		});
	}

	subscribeMempool(handler: (tx: MempoolTransaction) => void) {
		const unsubscribe = this.client.subscribeMempool(handler);
		return unsubscribe;
	}

	unsubscribeMempool() {
		this.client.unsubscribeMempool();
	}

	subscribeBlocks(handler: (block: Block) => void) {
		const unsubscribe = this.client.subscribeBlocks(handler);
		return unsubscribe;
	}

	unsubscribeBlocks() {
		this.client.unsubscribeBlocks();
	}

	subscribeTransaction(
		txId: string,
		handler: (transaction: Transaction | MempoolTransaction) => void,
	) {
		const unsubscribe = this.client.subscribeTransaction(txId, handler);
		return unsubscribe;
	}

	unsubscribeTransaction(txId: string) {
		this.client.unsubscribeTransaction(txId);
	}

	subscribeAddressTransactions(
		address: string,
		handler: (address: string, tx: AddressTransactionWithTransfers) => void,
	) {
		const unsubscribe = this.client.subscribeAddressTransactions(
			address,
			handler,
		);
		return unsubscribe;
	}

	unsubscribeAddressTransactions(address: string) {
		this.client.unsubscribeAddressTransactions(address);
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
