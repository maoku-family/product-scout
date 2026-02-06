import { logger } from './logger';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delay = 1000 } = options;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      logger.warn(`Retry ${String(i + 1)}/${String(maxRetries)}`, error);
      await sleep(delay * (i + 1)); // 指数退避
    }
  }
  throw new Error('Unreachable');
}
