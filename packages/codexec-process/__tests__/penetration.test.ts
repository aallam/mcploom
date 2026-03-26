import { runWrappedMcpPenetrationSuite } from "../../codexec/test-support/runWrappedMcpPenetrationSuite";
import { ProcessExecutor } from "../src/index";

runWrappedMcpPenetrationSuite("ProcessExecutor wrapped MCP", (options) => {
  return new ProcessExecutor(options);
});
