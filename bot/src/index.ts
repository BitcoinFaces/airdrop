import "cross-fetch/polyfill";
import config from "./config";
import { Api } from "./api";
import { StacksDevnet, StacksMainnet, StacksNetwork, StacksTestnet } from "@stacks/network";
import { Signer } from "./signer";
import { Executor } from "./executor";

const main = async () => {
    console.info("INITIALIZING AIRDROP");

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

    console.info("- Preparing signer");
    const signer = await Signer.create(config.SeedKey, "");

    console.info(`- Initializing connection with: ${network.coreApiUrl}`)
    const api = new Api(network);

    console.info("- Initializing executor");
    const executor = new Executor({
        network: network,
        signer: signer,
        accountId: 0,
        fee: 500000,
        maxPendingTx: 3,
        batchSize: 14995
    });

    api.subscribeBlocks(async (_) => {
        await executor.run()
    });
}

main();
