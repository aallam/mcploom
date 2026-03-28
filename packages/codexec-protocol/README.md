# @mcploom/codexec-protocol

Transport-safe messages and host-session helpers for transport-backed codexec runtimes.

[![npm version](https://img.shields.io/npm/v/%40mcploom%2Fcodexec--protocol?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-protocol)
[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)

## What This Package Is For

This is a low-level package for building transport-backed codexec runtimes. It does not execute guest code by itself.

It currently provides:

- runner/dispatcher message types
- a shared host transport session for worker/process-style executors
- the same host transport session shape used by `@mcploom/codexec-remote`
- transport-facing access to the shared manifest and dispatcher model from `@mcploom/codexec`

Most application code should use `@mcploom/codexec` plus an executor package directly instead of importing this package.
Treat this package as experimental and transport-internal while the execution architecture is still evolving.

## Used By

- `@mcploom/codexec-worker`
- `@mcploom/codexec-process`
- `@mcploom/codexec-remote`

`@mcploom/codexec-quickjs` and `@mcploom/codexec-isolated-vm` use the shared runner semantics from `@mcploom/codexec` directly and do not currently depend on this package.

## Install

```bash
npm install @mcploom/codexec @mcploom/codexec-protocol
```

## Security Notes

- This package is protocol glue, not a sandbox.
- It does not provide isolation by itself.
- The host tool surface remains the real capability boundary.
- Worker/process lifecycle isolation comes from the surrounding executor package, not from this package alone.

## Architecture Docs

- [Codexec architecture overview](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/README.md)
- [Codexec MCP adapters and protocol](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/codexec-mcp-and-protocol.md)
