/** Console stand-in for the API server's pino logger (pino's worker transports don't bundle into Electron). */
export const logger = {
  info: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
  debug: () => {},
};
