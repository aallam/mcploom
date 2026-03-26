# @mcploom/codexec-process

Child-process executor for `@mcploom/codexec`, using the shared QuickJS runner behind a Node IPC boundary.

[![npm version](https://img.shields.io/npm/v/%40mcploom%2Fcodexec--process?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-process)
[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)

## Choose `codexec-process` When

- you want QuickJS semantics with a stronger lifecycle boundary than worker threads
- you want to hard-kill the execution process on timeout
- you are comfortable paying child-process startup overhead per execution

If you want the simplest default backend, use [`@mcploom/codexec-quickjs`](https://www.npmjs.com/package/@mcploom/codexec-quickjs) instead.

## Install

```bash
npm install @mcploom/codexec @mcploom/codexec-process
```

## Usage

```ts
import { resolveProvider } from "@mcploom/codexec";
import { ProcessExecutor } from "@mcploom/codexec-process";

const provider = resolveProvider({
  name: "tools",
  tools: {
    echo: {
      execute: async (input) => input,
    },
  },
});

const executor = new ProcessExecutor();
const result = await executor.execute("await tools.echo({ ok: true })", [
  provider,
]);
```

## Security Notes

- This package improves lifecycle isolation by moving the QuickJS runtime to a fresh child process.
- It is still not documented as a hard hostile-code boundary equivalent to a container or VM.
- Providers remain the real capability boundary.

## Examples

- [Process-backed codexec execution](https://github.com/aallam/mcploom/blob/main/examples/codexec-process.ts)
- [Architecture overview](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/README.md)
- [Executors architecture](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/codexec-executors.md)
