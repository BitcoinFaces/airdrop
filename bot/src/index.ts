import "cross-fetch/polyfill";
import config from "./config";
import { Api } from "./api";
import { StacksDevnet, StacksMainnet, StacksNetwork, StacksTestnet } from "@stacks/network";
import { Signer } from "./signer";
import { Executor } from "./executor";

const main = async () => {
    if (config.SeedKey === "") {
        console.error("SEED_KEY environment variable is not set");
        process.exit(1);
    }

    let network: StacksNetwork;
    switch (config.Network) {
        case "DEVNET": {
            network = new StacksDevnet();
            break;
        }
        case "TESTNET": {
            network = new StacksTestnet();
            break;
        }
        case "MAINNET": {
            network = new StacksMainnet();
            break;
        }
        default: {
            console.error("Invalid Network");
            process.exit(1);
        }
    }

    console.info("Preparing signer");
    const signer = await Signer.create(config.SeedKey, "");

    console.info(`Initializing connection with: ${network.coreApiUrl}`)
    const api = new Api(network);

    const executor = new Executor({
        network: network,
        signer: signer,
        accountId: 0,
        fee: 250,
        maxPendigTx: 3,
        batchSize: 8000
    });

    api.subscribeBlocks(async (_) => {
        await executor.run()
    });
}

main();
