import { runWrappedMcpPenetrationSuite } from "../../codexec/test-support/runWrappedMcpPenetrationSuite";
import { WorkerExecutor } from "../src/index";

runWrappedMcpPenetrationSuite("WorkerExecutor wrapped MCP", (options) => {
  return new WorkerExecutor(options);
});
