# Codexec MCP Adapters and Protocol

This page explains two related but distinct parts of the current architecture:

- MCP adapters in `@mcploom/codexec`
- transport-safe execution seams in `@mcploom/codexec-protocol`

## MCP Wrapping Today

The MCP adapter layer lets codexec sit on either side of an MCP tool catalog:

- `openMcpToolProvider()` / `createMcpToolProvider()` turn an MCP client or local server into a `ResolvedToolProvider`
- `codeMcpServer()` exposes codexec execution back out as MCP tools such as `mcp_execute_code`, `mcp_search_tools`, and `mcp_code`

```mermaid
flowchart LR
    UP["Upstream MCP client or server"]
    WRAP["openMcpToolProvider / createMcpToolProvider"]
    PROVIDER["ResolvedToolProvider<br/>namespace + types + tool wrappers"]
    EXEC["Executor"]
    SERVER["codeMcpServer"]
    DOWN["Downstream MCP client"]

    UP --> WRAP --> PROVIDER
    PROVIDER --> EXEC
    PROVIDER --> SERVER
    EXEC --> SERVER
    SERVER --> DOWN
```

### What the MCP Adapter Layer Adds

- discovery of upstream MCP tools through a client connection
- conversion of raw MCP tools into a resolved provider namespace
- generated namespace typings for the wrapped MCP surface
- lifecycle ownership for locally opened in-memory MCP connections
- optional wrapper server identity override when exposing codexec back out as MCP

## Protocol Role Today

`@mcploom/codexec-protocol` is not a sandbox runtime. It is the transport-safe glue that lets a runtime and a trusted host exchange execution messages without sharing host closures.

It currently provides:

- `execute`, `cancel`, `started`, `tool_call`, `tool_result`, and `done` message types
- a shared host transport session used by worker/process executors
- transport-facing access to the shared manifest and dispatcher model from `@mcploom/codexec`

The important architectural split is:

- `@mcploom/codexec` owns manifest extraction and host-side tool dispatch semantics
- `@mcploom/codexec-protocol` owns wire messages and the shared host session around those semantics

```mermaid
sequenceDiagram
    participant Dispatcher as Trusted host
    participant Core as codexec core
    participant Protocol as codexec-protocol
    participant Runner as Runner runtime

    Dispatcher->>Core: extractProviderManifests(providers)
    Dispatcher->>Protocol: runHostTransportSession(...)
    Protocol->>Runner: execute(code, manifests, limits)
    Runner-->>Dispatcher: started
    Runner-->>Dispatcher: tool_call(providerName, safeToolName, input)
    Dispatcher->>Core: createToolCallDispatcher(...)
    Dispatcher-->>Runner: tool_result(ok/result or error)
    Runner-->>Dispatcher: done(ExecuteResult)
```

## How the Current Packages Use the Protocol

Today the protocol package is already part of the merged architecture, not just a future idea:

- `ProcessExecutor` uses the shared host session across the child-process boundary.
- `WorkerExecutor` uses the shared host session across the worker-thread boundary.
- `QuickJsExecutor` does not use the protocol package directly; it shares the same runner semantics from core without crossing a transport boundary.
- `IsolatedVmExecutor` also uses the shared core runner semantics, but keeps a direct `isolated-vm` bridge instead of protocol messages.

That split is intentional today:

- the process and worker paths need a real wire protocol
- the in-process QuickJS and `isolated-vm` paths do not
- worker and process now also align on the same parent-side host session and the same child-side QuickJS protocol endpoint
- all four now align on the same core runner-level contract

## Current vs Next Step

```mermaid
flowchart TB
    subgraph Current
        C1["QuickJsExecutor<br/>shared runner semantics"]
        C2["ProcessExecutor"]
        C3["WorkerExecutor"]
        C4["IsolatedVmExecutor<br/>shared runner semantics"]
        P["Protocol messages + host session"]
        C2 --> P
        C3 --> P
        C1 -. no transport boundary .-> C1
        C4 -. direct ivm bridge .-> C4
    end

    subgraph NextStepDirection
        N1["remote runner service"]
        N2["future isolated-vm transport-backed runner"]
        N1 --> P
        N2 --> P
    end
```

## Next-Step Direction

The protocol package creates a seam for future execution shapes without changing the `Executor` contract in `@mcploom/codexec`.

The most natural future uses are:

- a remote runner or worker fleet
- a transport-backed `isolated-vm` runner if the project later wants that consistency

What is not merged today:

- a remote executor package
- HTTP or WebSocket session transport for codexec execution
- a protocol-backed `IsolatedVmExecutor`

So the current docs should be read as:

- MCP adapters are production architecture now
- `codexec-protocol` is production architecture now
- shared runner semantics in `@mcploom/codexec` are production architecture now
- the worker/process transport stack is production architecture now and no longer duplicates its protocol loop in each executor
- remote/fleet execution is an enabled direction, not current shipped behavior
