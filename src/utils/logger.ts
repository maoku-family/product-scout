function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export const logger = {
  info: (msg: string, data?: unknown): void => {
    console.log(`[INFO] ${timestamp()} ${msg}`, data ?? '');
  },

  warn: (msg: string, data?: unknown): void => {
    console.warn(`[WARN] ${timestamp()} ${msg}`, data ?? '');
  },

  error: (msg: string, data?: unknown): void => {
    console.error(`[ERROR] ${timestamp()} ${msg}`, data ?? '');
  },

  debug: (msg: string, data?: unknown): void => {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${timestamp()} ${msg}`, data ?? '');
    }
  },
};
