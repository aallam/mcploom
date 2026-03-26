# @mcploom/codexec-protocol

Transport-safe manifests, messages, and dispatcher helpers for codexec execution runtimes.

[![npm version](https://img.shields.io/npm/v/%40mcploom%2Fcodexec--protocol?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-protocol)
[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)

## What This Package Is For

This is a low-level package for building transport-backed codexec runtimes. It does not execute guest code by itself.

It currently provides:

- provider manifests derived from `ResolvedToolProvider`
- runner/dispatcher message types
- a host-side tool dispatcher that turns `tool_call` messages back into resolved tool invocations

Most application code should use `@mcploom/codexec` plus an executor package directly instead of importing this package.

## Used By

- `@mcploom/codexec-quickjs`
- `@mcploom/codexec-worker`

`@mcploom/codexec-isolated-vm` does not currently use this package.

## Install

```bash
npm install @mcploom/codexec @mcploom/codexec-protocol
```

## Security Notes

- This package is protocol glue, not a sandbox.
- It does not provide isolation by itself.
- The host tool surface remains the real capability boundary.

## Architecture Docs

- [Codexec architecture overview](https://github.com/aallam/mcploom/blob/main/docs/architecture/codexec-overview.md)
- [Codexec MCP adapters and protocol](https://github.com/aallam/mcploom/blob/main/docs/architecture/codexec-mcp-and-protocol.md)
