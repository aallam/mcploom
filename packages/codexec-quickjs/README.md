# @mcploom/codexec-quickjs

QuickJS executor package for `@mcploom/codexec`.

## Install

```bash
npm install @mcploom/codexec @mcploom/codexec-quickjs
```

Use this package when you want the smallest, easiest-to-install executor backend for codexec.

## Usage

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

Each execution runs in a fresh QuickJS runtime with captured `console.*` output, timeout handling, and JSON-only tool/result boundaries.
