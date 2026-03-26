import { runExecutorContractSuite } from "../../codexec/test-support/runExecutorContractSuite";
import { ProcessExecutor } from "../src/index";

runExecutorContractSuite("ProcessExecutor", (options) => {
  return new ProcessExecutor(options);
});
