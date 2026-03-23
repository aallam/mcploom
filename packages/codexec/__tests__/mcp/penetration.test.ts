import { QuickJsExecutor } from "@mcploom/codexec-quickjs";

import { runWrappedMcpPenetrationSuite } from "../../test-support/runWrappedMcpPenetrationSuite";

runWrappedMcpPenetrationSuite(
  "QuickJS wrapped MCP penetration tests",
  (options) => {
    return new QuickJsExecutor(options);
  },
);
