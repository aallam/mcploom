import { QuickJsExecutor } from "@mcploom/codexec-quickjs";

import { runAdversarialSecuritySuite } from "../../test-support/runAdversarialSecuritySuite";

runAdversarialSecuritySuite(
  "QuickJS adversarial security tests",
  (options) => {
    return new QuickJsExecutor(options);
  },
);
