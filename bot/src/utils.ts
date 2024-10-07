export const retryPromise = async <T>(
	fn: Promise<T>,
	maxTries = 5,
	delay = 5000,
): Promise<T> => {
	try {
		return await fn;
	} catch (err) {
		console.info(`- Retrying broadcast, timeout ${delay}ms`);
		console.info(`- Error: ${String(err)}`);
		await new Promise((resolve) => setTimeout(resolve, delay));
		if (maxTries === 0) {
			console.log("- Max retries reached");
			if (err instanceof Error) {
				throw err;
			}
			throw new Error(String(err));
		}
		const newLimit = maxTries - 1;
		return await retryPromise(fn, newLimit, delay + 500);
	}
};

export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));
