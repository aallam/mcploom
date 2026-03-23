# @mcploom/codexec

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
