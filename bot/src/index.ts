import { StacksDevnet, StacksMainnet, StacksTestnet } from "@stacks/network";
import type { StacksNetwork } from "@stacks/network";
import { Api } from "./api";
import config from "./config";
import { Executor } from "./executor";
import { Signer } from "./signer";
import { log as mainLogger } from "./utils";

const log = mainLogger.getSubLogger({ name: "Bot" })

const main = async () => {
    log.info("INITIALIZING AIRDROP");

    if (config.SeedKey === "") {
        log.error("SEED_KEY environment variable is not set");
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
            log.error("Invalid Network");
            process.exit(1);
        }
    }

    log.trace("- Preparing signer");
    const signer = await Signer.create(config.SeedKey, "");

    log.trace(`- Initializing connection with: ${network.coreApiUrl}`);
    const api = new Api(network);

    log.trace("- Initializing executor");
    const executor = new Executor({
        network: network,
        signer: signer,
        accountId: 0,
        fee: 1_000_000,
        maxPendingTx: 24,
        batchSize: 6000,
    });

    // run once before waiting for blocks
    await executor.run();

    // kick off every new block
    api.subscribeBlocks(async (block) => {
        log.debug(`NEW BLOCK: ${block.height}`);
        await executor.run();
    });
};

main();
