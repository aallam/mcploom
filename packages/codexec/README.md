# @mcploom/codexec

Executor-agnostic MCP code execution core.

Exports:

- provider resolution and schema validation
- code normalization and tool-name sanitization
- JSON Schema type generation
- MCP adapters under `@mcploom/codexec/mcp`

Use a companion executor package such as `@mcploom/codexec-quickjs` to actually run sandboxed code.
