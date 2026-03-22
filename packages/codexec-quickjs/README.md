# @mcploom/codexec-quickjs

QuickJS executor package for `@mcploom/codexec`.

```ts
import { resolveProvider } from "@mcploom/codexec";
import { QuickJsExecutor } from "@mcploom/codexec-quickjs";

const provider = resolveProvider({
  tools: {
    echo: {
      execute: async (input) => input,
    },
  },
});

const executor = new QuickJsExecutor();
const result = await executor.execute("await codemode.echo({ ok: true })", [
  provider,
]);
```
