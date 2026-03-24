import { IsolatedVmExecutor } from "@mcploom/codexec-isolated-vm";
import { runExecutorContractSuite } from "../../codexec/test-support/runExecutorContractSuite";

runExecutorContractSuite("IsolatedVmExecutor", (options) => new IsolatedVmExecutor(options));
