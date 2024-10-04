import { generateNewAccount, generateWallet, Wallet } from "@stacks/wallet-sdk";

export class Signer {
    private wallet: Wallet;

    private constructor(wallet: Wallet) {
        this.wallet = wallet;
    }

    public static create = async (
        seed: string,
        passphrase: string
    ): Promise<Signer> => {
        const wallet = await generateWallet({ secretKey: seed, password: passphrase });
        const instance = new Signer(wallet);
        return instance;
    };

    getAccount = (id: number) => {
        const accountsCount = this.wallet.accounts.length;

        // create if missing account
        if (id > (accountsCount - 1)) {
            for (let i = accountsCount; i <= id; i++) {
                this.wallet = generateNewAccount(this.wallet);
            }
        }
        return this.wallet.accounts[id];
    };
}
