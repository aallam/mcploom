import { QuickJsExecutor } from "@mcploom/codexec-quickjs";
import { runExecutorContractSuite } from "../../codexec/test-support/runExecutorContractSuite";

runExecutorContractSuite("QuickJsExecutor", (options) => new QuickJsExecutor(options));
