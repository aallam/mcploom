# @mcploom/codexec

## 0.2.5

### Patch Changes

- Centralize executor helpers, tighten the penetration suite, and give MCP adapters an explicit `openMcpToolProvider` lifecycle plus better tooling exports so the new contract stays maintainable.

## 0.2.4

### Patch Changes

- Centralize executor helpers, tighten the penetration suite, and give MCP adapters an explicit `openMcpToolProvider` lifecycle plus better tooling exports so the new contract stays maintainable.

## 0.2.3

### Patch Changes

- Refactor the executor contract, shared helpers, and MCP lifecycle so both runtimes stay spoof-resistant and the wrapper owns cleanup, then push those helpers into codexec core with centralized identifier/typegen logic.

## 0.2.2

### Patch Changes

- Refresh the published package docs and generated API declarations.

  This release picks up the README updates, broader JSDoc coverage on exported package APIs, and the lint/CI hardening that now enforces those docs consistently.

## 0.2.1

### Patch Changes

- Patch release for the codexec package family.
  - harden the executor and provider boundaries around untrusted user code
  - propagate abort signals through wrapped MCP tool calls so timed-out executions cancel upstream work
  - refresh the codexec executor package READMEs with clearer security and usage guidance

## 0.2.0

### Minor Changes

- Add first-class Zod support to codexec tool schemas, including full Zod schemas and MCP-style raw Zod shapes.

  Refresh the codexec package READMEs and align the executor packages with the updated core release.
