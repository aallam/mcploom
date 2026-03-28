# @mcploom/codexec-remote

Transport-backed remote executor for `@mcploom/codexec`.

[![npm version](https://img.shields.io/npm/v/%40mcploom%2Fcodexec--remote?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-remote)
[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)

## Choose `codexec-remote` When

- you want codexec execution to live outside the application process
- you already own the transport and runtime deployment shape
- you want to keep the same `Executor` API while swapping in a stronger boundary

## Install

```bash
npm install @mcploom/codexec @mcploom/codexec-remote
```

## Usage

```ts
import { resolveProvider } from "@mcploom/codexec";
import { RemoteExecutor, attachQuickJsRemoteEndpoint } from "@mcploom/codexec-remote";

const provider = resolveProvider({
  name: "tools",
  tools: {
    echo: {
      execute: async (input) => input,
    },
  },
});

const executor = new RemoteExecutor({
  connectTransport: async () => myHostTransport,
  timeoutMs: 1000,
});

const result = await executor.execute(
  "await tools.echo({ ok: true })",
  [provider],
  { timeoutMs: 250 },
);

attachQuickJsRemoteEndpoint(myRunnerPort);
```

`RemoteExecutor` stays transport-agnostic. Your application owns the network stack and provides a fresh `HostTransport` per execution. `attachQuickJsRemoteEndpoint()` binds the shared QuickJS runner protocol to an app-provided remote port on the runner side.

## Security Notes

- This package improves the process boundary by moving execution behind a caller-supplied transport.
- It is still not a hard security boundary by itself. Your actual trust boundary depends on the remote runtime you deploy.
- Providers remain the capability boundary.
- The package is intentionally small: it does not create servers, own authentication, or prescribe an HTTP/WebSocket framework.

## Examples

- [Remote codexec execution](https://github.com/aallam/mcploom/blob/main/examples/codexec-remote.ts)
- [Codexec architecture overview](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/README.md)
- [Codexec MCP adapters and protocol](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/codexec-mcp-and-protocol.md)
