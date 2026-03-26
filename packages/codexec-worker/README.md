# @mcploom/codexec-worker

Worker-thread executor for `@mcploom/codexec`, using the shared QuickJS runner behind a message boundary.

[![npm version](https://img.shields.io/npm/v/%40mcploom%2Fcodexec--worker?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-worker)
[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)

## Choose `codexec-worker` When

- you want QuickJS semantics without running the runtime on the main thread
- you want a worker termination backstop for timeouts
- you are comfortable paying worker startup overhead per execution

If you want the simplest default backend, use [`@mcploom/codexec-quickjs`](https://www.npmjs.com/package/@mcploom/codexec-quickjs) instead.

## Install

```bash
npm install @mcploom/codexec @mcploom/codexec-worker
```

## Usage

```ts
import { resolveProvider } from "@mcploom/codexec";
import { WorkerExecutor } from "@mcploom/codexec-worker";

const provider = resolveProvider({
  name: "tools",
  tools: {
    echo: {
      execute: async (input) => input,
    },
  },
});

const executor = new WorkerExecutor();
const result = await executor.execute("await tools.echo({ ok: true })", [
  provider,
]);
```

## Security Notes

- This package improves lifecycle isolation by moving the QuickJS runtime to a worker thread.
- It is still same-process execution and is not documented as a hard hostile-code boundary.
- Providers remain the real capability boundary.
- Internally it is a thin transport adapter over the shared `codexec-protocol` host session and the shared QuickJS protocol endpoint.

## Examples

- [Worker-backed codexec execution](https://github.com/aallam/mcploom/blob/main/examples/codexec-worker.ts)
- [Architecture overview](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/README.md)
- [Executors architecture](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/codexec-executors.md)
