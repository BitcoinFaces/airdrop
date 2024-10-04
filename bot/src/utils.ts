export const retryPromise = async <T>(
    fn: Promise<T>,
    maxTries = 5,
    delay = 5000
): Promise<T> => {
    try {
        return await fn;
    } catch (err: any) {
        console.info("Retrying promise.");
        console.info(err);
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (maxTries == 0) {
            throw new Error(err.message);
        }

        return await retryPromise(fn, --maxTries, delay + 500);
    }
};


export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
