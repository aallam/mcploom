# @mcploom/codexec-isolated-vm

`isolated-vm` executor package for `@mcploom/codexec`.

It implements the shared `Executor` contract from `@mcploom/codexec`, so it can be used anywhere the QuickJS package can be used.

Requirements:

- Node 20+ must run with `--no-node-snapshot`
- `isolated-vm` must install successfully in the host environment
- native-addon failures are surfaced only when `IsolatedVmExecutor` is used

This package is verified through the opt-in workspace flow:

```bash
npm run verify:isolated-vm
```

`isolated-vm` is not documented here as a hard security boundary. If the workload is hostile or process stability matters more than in-process performance, prefer process isolation around the executor.
