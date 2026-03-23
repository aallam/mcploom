import { IsolatedVmExecutor } from "@mcploom/codexec-isolated-vm";

import { runAdversarialSecuritySuite } from "../../codexec/test-support/runAdversarialSecuritySuite";

runAdversarialSecuritySuite(
  "isolated-vm adversarial security tests",
  (options) => {
    return new IsolatedVmExecutor(options);
  },
);
