# @gomcp/analytics

## 0.2.0

### Minor Changes

- Harden runtime behavior and add session-level analytics.
  - Prevent event loss on exporter failures by re-queuing failed flush batches, and safely handle periodic flush errors.
  - Fix tracing context propagation and transport span lifecycle race/cleanup behavior.
  - Add session analytics APIs (`getSessionStats`, `getTopSessions`) and include `sessions` in `getStats()`.
  - Add `samplingStrategy` (`per_call`/`per_session`) and `toolWindowSize` for bounded percentile memory.
  - Breaking: remove `otlp.useGlobalProvider`; use `tracing: true` for global tracer integration.
