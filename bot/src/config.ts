import * as dotenv from "dotenv";
dotenv.config();
export default {
	SeedKey: process.env.SEED_KEY ?? "",
	AccountId: process.env.ACCOUNT_ID ?? 0,
	Network: process.env.NETWORK ?? "DEVNET",
};
