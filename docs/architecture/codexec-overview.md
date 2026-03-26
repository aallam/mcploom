# Codexec Architecture Overview

Codexec is the code-execution part of the `mcploom` workspace. It turns host tool catalogs into callable guest namespaces, lets those namespaces wrap MCP tools, and pairs with executor packages that decide where and how guest JavaScript runs.

This doc set is for two audiences:

- Integrators choosing packages and deployment shapes
- Contributors reasoning about package boundaries, control flow, and trade-offs

## Reading Guide

- Start here for the package map, trust model, and overall flow.
- Read [codexec-core.md](./codexec-core.md) for provider resolution, execution contracts, and error handling.
- Read [codexec-executors.md](./codexec-executors.md) for QuickJS, `isolated-vm`, and worker-thread trade-offs.
- Read [codexec-mcp-and-protocol.md](./codexec-mcp-and-protocol.md) for MCP wrapping and the current role of `codexec-protocol`.

## Package Map

```mermaid
flowchart LR
    APP[Host application]
    CORE["@mcploom/codexec<br/>provider resolution + MCP adapters"]
    QJS["@mcploom/codexec-quickjs<br/>in-process QuickJS executor"]
    IVM["@mcploom/codexec-isolated-vm<br/>in-process isolated-vm executor"]
    PROTO["@mcploom/codexec-protocol<br/>manifests + messages + dispatcher"]
    WORKER["@mcploom/codexec-worker<br/>worker-thread executor"]
    MCP[MCP sources and wrapped servers]

    APP --> CORE
    APP --> QJS
    APP --> IVM
    APP --> WORKER
    CORE --> MCP
    QJS --> PROTO
    WORKER --> PROTO
    WORKER --> QJS
```

### Package Roles Today

| Package                        | Role                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `@mcploom/codexec`             | Core types, provider resolution, namespace/type generation, and MCP adapters                            |
| `@mcploom/codexec-quickjs`     | Default executor backend using a fresh QuickJS runtime per execution                                    |
| `@mcploom/codexec-isolated-vm` | Alternate executor backend using a fresh `isolated-vm` context                                          |
| `@mcploom/codexec-protocol`    | Transport-safe provider manifests, runner/dispatcher message types, and host-side tool dispatch helpers |
| `@mcploom/codexec-worker`      | Worker-thread executor that runs the QuickJS session behind a message boundary                          |

## End-to-End Execution Model

At a high level, codexec always follows the same model:

1. Host code defines or discovers tools.
2. `@mcploom/codexec` resolves those tools into a deterministic guest namespace.
3. An executor runs guest JavaScript against that resolved namespace.
4. Guest tool calls cross a host-controlled boundary and return structured JSON-compatible results.

```mermaid
sequenceDiagram
    participant Host as Host app
    participant Core as codexec core
    participant Exec as Executor
    participant Guest as Guest runtime

    Host->>Core: resolveProvider() or openMcpToolProvider()
    Core-->>Host: ResolvedToolProvider
    Host->>Exec: execute(code, [provider])
    Exec->>Guest: boot fresh runtime
    Guest->>Exec: await namespace.tool(input)
    Exec->>Host: invoke resolved tool wrapper
    Host-->>Exec: JSON-safe result or ExecuteError
    Exec-->>Host: ExecuteResult
```

## Trust Model and Security Posture

Codexec reduces accidental exposure, but it does not claim a hard security boundary for hostile code in its default deployment model.

```mermaid
flowchart LR
    USER[Guest code author]
    GUEST[Guest JavaScript]
    PROVIDERS[Resolved providers]
    SYSTEMS[Host systems and APIs]
    MCP3P[Third-party MCP servers]

    USER --> GUEST
    GUEST -->|tool inputs| PROVIDERS
    PROVIDERS -->|capabilities| SYSTEMS
    MCP3P -. optional wrapped dependency .-> PROVIDERS
```

Key implications:

- The real capability boundary is the provider/tool surface, not the JavaScript syntax itself.
- Fresh runtimes, schema validation, JSON-only boundaries, timeouts, memory limits, and bounded logs are defense-in-depth features.
- In-process execution still shares the host process. Use a separate process, container, VM, or similar boundary when the code source is hostile or multi-tenant.
- Wrapping third-party MCP servers is a separate dependency-trust decision from letting end users author guest code.

## Current Architecture in One Paragraph

Today, `@mcploom/codexec` owns the stable execution contract and MCP adapters. QuickJS and worker-backed execution already share the transport-safe concepts in `@mcploom/codexec-protocol`. `@mcploom/codexec-isolated-vm` still uses a direct in-process host bridge rather than the protocol boundary. That means the system already supports both direct and transport-backed execution styles, with the protocol package acting as the seam for worker or future remote runners.
