# @mcploom/codexec-isolated-vm

`isolated-vm` executor backend for `@mcploom/codexec`.

[![npm version](https://img.shields.io/npm/v/%40mcploom%2Fcodexec--isolated--vm?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-isolated-vm)
[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)

## Choose `isolated-vm` When

- you explicitly want the `isolated-vm` runtime instead of QuickJS
- your environment can support the native addon install
- you are prepared to run Node 22+ with `--no-node-snapshot`

If you want the simpler default backend, use [`@mcploom/codexec-quickjs`](https://www.npmjs.com/package/@mcploom/codexec-quickjs) instead.

## Examples

- [Basic provider execution on `isolated-vm`](https://github.com/aallam/mcploom/blob/main/examples/codexec-isolated-vm-basic.ts)
- [QuickJS-based codexec examples for the shared API surface](https://github.com/aallam/mcploom/blob/main/examples/codexec-basic.ts)
- [Full examples index](https://github.com/aallam/mcploom/tree/main/examples)

## Install

```bash
npm install @mcploom/codexec @mcploom/codexec-isolated-vm
```

## Requirements

- Node 22+ must run with `--no-node-snapshot`
- the optional `isolated-vm` native dependency must install successfully in the host environment
- native-addon failures are surfaced when `IsolatedVmExecutor` is constructed or used

## Security Notes

- Each execution gets a fresh `isolated-vm` context with JSON-only tool and result boundaries.
- In the default deployment model, provider definitions are controlled by the host application, while hostile users control guest code and tool inputs.
- This package is still in-process execution. It should not be marketed or relied on as a hard security boundary for hostile code.
- Providers remain the real capability boundary. If a tool is dangerous, guest code can invoke it.

## Usage

```ts
import { resolveProvider } from "@mcploom/codexec";
import { IsolatedVmExecutor } from "@mcploom/codexec-isolated-vm";

const provider = resolveProvider({
  tools: {
    echo: {
      execute: async (input) => input,
    },
  },
});

const executor = new IsolatedVmExecutor();
const result = await executor.execute("await codemode.echo({ ok: true })", [
  provider,
]);
```

This package is verified through the opt-in workspace flow:

```bash
npm run verify:isolated-vm
```

`isolated-vm` is not documented here as a hard security boundary. If process stability matters more than in-process performance, prefer process isolation around the executor.
