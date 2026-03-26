import { runExecutorContractSuite } from "../../codexec/test-support/runExecutorContractSuite";
import { WorkerExecutor } from "../src/index";

runExecutorContractSuite("WorkerExecutor", (options) => new WorkerExecutor(options));
