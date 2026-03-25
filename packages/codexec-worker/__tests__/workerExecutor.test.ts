import { WorkerExecutor } from "@mcploom/codexec-worker";
import { runExecutorContractSuite } from "../../codexec/test-support/runExecutorContractSuite";

// Worker threads have ~50-100ms startup overhead, so we enforce a minimum
// timeout that still tests the timeout path but allows the worker to start.
const MIN_TIMEOUT_MS = 200;

runExecutorContractSuite(
  "WorkerExecutor",
  (options) =>
    new WorkerExecutor({
      timeoutMs: Math.max(options?.timeoutMs ?? 5000, MIN_TIMEOUT_MS),
      maxLogLines: options?.maxLogLines,
      maxLogChars: options?.maxLogChars,
      maxOldGenerationSizeMb: options?.memoryLimitBytes
        ? Math.ceil(options.memoryLimitBytes / (1024 * 1024))
        : undefined,
    }),
);
