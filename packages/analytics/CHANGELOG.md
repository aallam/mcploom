# @mcploom/analytics

## 0.3.1

### Patch Changes

- 5fc3c22: Update the MCP SDK integration to 1.28.0 and republish the full package set.

## 0.3.0

### Minor Changes

- a81d14a: Raise the published Node.js support floor from 20 to 22 across the infrastructure packages.

  This release also refreshes the published package metadata so the npm packages match the current workspace baseline.

## 0.2.1

### Patch Changes

- Refresh the published package docs and generated API declarations.

  This release picks up the README updates, broader JSDoc coverage on exported package APIs, and the lint/CI hardening that now enforces those docs consistently.

## 0.2.0

### Minor Changes

- Harden runtime behavior and add session-level analytics.
  - Prevent event loss on exporter failures by re-queuing failed flush batches, and safely handle periodic flush errors.
  - Fix tracing context propagation and transport span lifecycle race/cleanup behavior.
  - Add session analytics APIs (`getSessionStats`, `getTopSessions`) and include `sessions` in `getStats()`.
  - Add `samplingStrategy` (`per_call`/`per_session`) and `toolWindowSize` for bounded percentile memory.
  - Breaking: remove `otlp.useGlobalProvider`; use `tracing: true` for global tracer integration.
