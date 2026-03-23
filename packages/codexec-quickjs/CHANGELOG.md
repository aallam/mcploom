# @mcploom/codexec-quickjs

## 0.1.3

### Patch Changes

- Refresh the published package docs and generated API declarations.

  This release picks up the README updates, broader JSDoc coverage on exported package APIs, and the lint/CI hardening that now enforces those docs consistently.

- Updated dependencies
  - @mcploom/codexec@0.2.2

## 0.1.2

### Patch Changes

- Patch release for the codexec package family.
  - harden the executor and provider boundaries around untrusted user code
  - propagate abort signals through wrapped MCP tool calls so timed-out executions cancel upstream work
  - refresh the codexec executor package READMEs with clearer security and usage guidance

- Updated dependencies
  - @mcploom/codexec@0.2.1

## 0.1.1

### Patch Changes

- Refresh the package README and align the executor release with the updated codexec core.

- Updated dependencies
  - @mcploom/codexec@0.2.0
