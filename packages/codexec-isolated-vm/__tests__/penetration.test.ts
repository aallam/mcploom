import { IsolatedVmExecutor } from "@mcploom/codexec-isolated-vm";

import { runWrappedMcpPenetrationSuite } from "../../codexec/test-support/runWrappedMcpPenetrationSuite";

runWrappedMcpPenetrationSuite(
  "isolated-vm wrapped MCP penetration tests",
  (options) => {
    return new IsolatedVmExecutor(options);
  },
);
