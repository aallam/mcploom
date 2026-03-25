/**
 * Configuration options for the worker thread executor.
 */
export interface WorkerExecutorOptions {
  /** Maximum execution time in milliseconds before the worker is terminated. Defaults to 5000. */
  timeoutMs?: number;

  /** Maximum old-generation heap size in MB for the worker V8 isolate. Defaults to 64. */
  maxOldGenerationSizeMb?: number;

  /** Maximum young-generation heap size in MB for the worker V8 isolate. Defaults to 16. */
  maxYoungGenerationSizeMb?: number;

  /** Maximum number of log lines to capture. Defaults to 100. */
  maxLogLines?: number;

  /** Maximum total log characters to capture. Defaults to 64000. */
  maxLogChars?: number;
}
