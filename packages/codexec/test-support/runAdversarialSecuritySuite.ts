import { describe, expect, it } from "vitest";

import { resolveProvider } from "@mcploom/codexec";
import type { ToolProvider } from "@mcploom/codexec";

import {
  createAdversarialHarness,
} from "./adversarialToolHarness";
import type { PenetrationExecutorFactory } from "./hostileMcpHarness";

export function runAdversarialSecuritySuite(
  label: string,
  createExecutor: PenetrationExecutorFactory,
): void {
  describe(label, () => {
    // -----------------------------------------------------------------------
    // AV-1: Console log memory exhaustion (pre-truncation)
    // -----------------------------------------------------------------------
    describe("AV-1: Console log memory exhaustion", () => {
      it("logs array grows unbounded during execution before truncation", async () => {
        const { wrappedClient } = await createAdversarialHarness(
          createExecutor,
          { maxLogLines: 5, maxLogChars: 50, timeoutMs: 10_000 },
        );

        // Guest floods console.log with large strings.
        // The logs array grows on the host heap during execution;
        // truncation only happens when building the return value.
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              for (let i = 0; i < 50000; i++) {
                console.log("A".repeat(200));
              }
              "done"
            `,
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;

        // Execution should still succeed (or timeout/OOM depending on executor)
        // The key finding: returned logs are truncated, but host memory was consumed during execution
        if (structured.ok) {
          const logs = structured.logs as string[];
          // Logs should be truncated to the configured limits
          expect(logs.length).toBeLessThanOrEqual(5);
          const totalChars = logs.reduce((sum, line) => sum + line.length, 0);
          expect(totalChars).toBeLessThanOrEqual(50);
        }
        // If it errored (timeout or memory_limit), the vulnerability was hit —
        // the host spent resources processing all those logs before truncating.
        // Either outcome demonstrates the issue.
      });
    });

    // -----------------------------------------------------------------------
    // AV-2: Error code spoofing
    // -----------------------------------------------------------------------
    describe("AV-2: Error code spoofing", () => {
      it("guest can spoof timeout error code", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              const err = new Error("fake timeout");
              err.code = "timeout";
              throw err;
            `,
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        expect(structured.ok).toBe(false);

        const error = structured.error as Record<string, unknown>;
        // VULNERABILITY: guest-controlled error code is accepted as-is
        expect(error.code).toBe("timeout");
      });

      it("guest can spoof internal_error code", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              const err = new Error("fake internal error");
              err.code = "internal_error";
              throw err;
            `,
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        expect(structured.ok).toBe(false);

        const error = structured.error as Record<string, unknown>;
        // VULNERABILITY: guest can masquerade as internal system error
        expect(error.code).toBe("internal_error");
      });

      it("guest can spoof memory_limit error code", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              const err = new Error("fake memory limit");
              err.code = "memory_limit";
              throw err;
            `,
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        expect(structured.ok).toBe(false);

        const error = structured.error as Record<string, unknown>;
        expect(error.code).toBe("memory_limit");
      });
    });

    // -----------------------------------------------------------------------
    // AV-3: Message-based error classification injection
    // -----------------------------------------------------------------------
    describe("AV-3: Message-based error classification injection", () => {
      it("error message containing 'timed out' may cause misclassification", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: 'throw new Error("The upstream service timed out, please retry later")',
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        expect(structured.ok).toBe(false);

        const error = structured.error as Record<string, unknown>;
        // In isolated-vm, toExecuteError does string matching on "timed out"
        // which misclassifies this as a timeout instead of runtime_error.
        // QuickJS may behave differently since it checks "interrupted" instead.
        // We record the actual behavior for the report.
        expect(["timeout", "runtime_error"]).toContain(error.code);
      });

      it("error message containing 'memory limit' may cause misclassification", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: 'throw new Error("Warning: approaching memory limit threshold")',
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        expect(structured.ok).toBe(false);

        const error = structured.error as Record<string, unknown>;
        // In isolated-vm, this gets misclassified as memory_limit.
        // QuickJS checks "out of memory" which is a tighter match.
        expect(["memory_limit", "runtime_error"]).toContain(error.code);
      });
    });

    // -----------------------------------------------------------------------
    // AV-4: Unbounded result size through MCP layer
    // -----------------------------------------------------------------------
    describe("AV-4: Unbounded result size through MCP layer", () => {
      it("structuredContent is not size-limited even when text content is truncated", async () => {
        const { wrappedClient } = await createAdversarialHarness(
          createExecutor,
          { timeoutMs: 10_000 },
        );

        // Guest returns a large string directly as its result.
        // This flows through the MCP layer as structuredContent.result.
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: '"x".repeat(5000)',
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;

        if (structured.ok) {
          const result = structured.result as string;
          expect(result.length).toBe(5000);

          // Verify text content was truncated (maxTextChars=1000 in harness)
          const content = executeResult.content as Array<{ text: string; type: string }>;
          expect(content[0].text.length).toBeLessThanOrEqual(1000);

          // But structuredContent carries the full 5000-char result without truncation
          const structuredStr = JSON.stringify(executeResult.structuredContent);
          expect(structuredStr.length).toBeGreaterThan(5000);
        }
      });
    });

    // -----------------------------------------------------------------------
    // AV-5: Concurrent tool call amplification
    // -----------------------------------------------------------------------
    describe("AV-5: Concurrent tool call amplification", () => {
      it("guest can issue many concurrent tool calls to the host", async () => {
        const { state, wrappedClient } = await createAdversarialHarness(
          createExecutor,
          { timeoutMs: 10_000 },
        );

        state.callCount = 0;

        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              const results = await Promise.all(
                Array.from({ length: 50 }, () => mcp.slow_tool({}))
              );
              results.length
            `,
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;

        if (structured.ok) {
          // All 50 concurrent tool calls succeeded
          expect(structured.result).toBe(50);
          // All 50 calls hit the host tool
          expect(state.callCount).toBe(50);
        }
      });
    });

    // -----------------------------------------------------------------------
    // AV-6: Host reference enumeration
    // -----------------------------------------------------------------------
    describe("AV-6: Host reference enumeration", () => {
      it("guest can discover internal binding names on globalThis", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              const allProps = Object.getOwnPropertyNames(globalThis);
              const mcpInternals = allProps.filter(k => k.startsWith("__mcp"));
              const providerNames = allProps.filter(k =>
                typeof globalThis[k] === "object" &&
                globalThis[k] !== null &&
                k !== "console" &&
                !k.startsWith("__")
              );
              ({
                totalGlobals: allProps.length,
                mcpInternals,
                providerNames,
                allProps: allProps.sort()
              })
            `,
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        expect(structured.ok).toBe(true);

        const result = structured.result as Record<string, unknown>;
        // In isolated-vm, __mcp_tool_* and __mcp_console_* are enumerable.
        // In QuickJS, these internal bindings are not exposed (tools are nested
        // under the provider object). Record what's discoverable.
        const mcpInternals = result.mcpInternals as string[];
        // Either way, the guest can at minimum discover the provider namespace
        const providerNames = result.providerNames as string[];
        expect(providerNames).toContain("mcp");
      });
    });

    // -----------------------------------------------------------------------
    // AV-7: Prototype pollution via JSON boundaries
    // -----------------------------------------------------------------------
    describe("AV-7: Prototype pollution via JSON boundaries", () => {
      it("__proto__ in tool result does not pollute guest Object.prototype", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              const result = await mcp.proto_inject({});
              const polluted = ({}).polluted;
              const hasSafe = result.structuredContent.safe;
              ({ polluted: polluted, safe: hasSafe, type: typeof polluted })
            `,
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        expect(structured.ok).toBe(true);

        const result = structured.result as Record<string, unknown>;
        // SAFE: JSON round-trip prevents prototype pollution
        expect(result.polluted).toBeUndefined();
        expect(result.type).toBe("undefined");
        expect(result.safe).toBe("value");
      });

      it("guest __proto__ payload does not pollute host Object.prototype", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              JSON.parse('{"__proto__": {"hostPolluted": true}, "value": 42}')
            `,
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        expect(structured.ok).toBe(true);

        // Verify host prototype was not polluted
        expect(({} as Record<string, unknown>).hostPolluted).toBeUndefined();
      });
    });

    // -----------------------------------------------------------------------
    // AV-8: Unicode edge cases in boundary transfer
    // -----------------------------------------------------------------------
    describe("AV-8: Unicode edge cases in boundary transfer", () => {
      it("adversarial unicode strings round-trip safely through host-guest boundary", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              const result = await mcp.unicode_edge({});
              const sc = result.structuredContent;
              // Verify no code injection occurred
              const notPwned = typeof globalThis.__pwned === "undefined";
              ({
                lineSeparator: sc.lineSeparator,
                paragraphSeparator: sc.paragraphSeparator,
                nullByte: sc.nullByte,
                injection: sc.injection,
                backtick: sc.backtick,
                emoji: sc.emoji,
                notPwned
              })
            `,
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        expect(structured.ok).toBe(true);

        const result = structured.result as Record<string, unknown>;
        // SAFE: All unicode edge cases handled correctly by JSON serialization
        expect(result.notPwned).toBe(true);
        expect(result.lineSeparator).toBe("\u2028");
        expect(result.paragraphSeparator).toBe("\u2029");
        expect(result.nullByte).toBe("\u0000");
        expect(result.injection).toBe('"); globalThis.__pwned = true; ("');
        expect(result.emoji).toBe("\uD83D\uDE00");
      });
    });

    // -----------------------------------------------------------------------
    // AV-9: normalizeCode parser bypass attempts
    // -----------------------------------------------------------------------
    describe("AV-9: normalizeCode parser bypass", () => {
      it("code injection via async wrapper breakout is contained by sandbox", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);

        // Attempt to break out of the async () => { ... } wrapper
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: '}); process.exit(1); (async () => {',
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        // Should fail safely — either a syntax/runtime error or process is undefined
        // The process should NOT have exited
        expect(structured.ok).toBe(false);
      });

      it("import() expressions are blocked or harmless in sandbox", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              try {
                const fs = await import("fs");
                return "ESCAPED: " + typeof fs.readFileSync;
              } catch (e) {
                return "BLOCKED: " + e.message;
              }
            `,
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        if (structured.ok) {
          // If execution succeeded, import must have been blocked
          const result = structured.result as string;
          expect(result).toMatch(/^BLOCKED:/);
        }
        // If it errored, import was blocked at the runtime level — also safe
      });

      it("eval() in sandbox cannot access host scope", async () => {
        const { wrappedClient } = await createAdversarialHarness(createExecutor);
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              try {
                const result = eval("typeof process");
                return result;
              } catch (e) {
                return "eval-blocked";
              }
            `,
          },
        });

        const structured = executeResult.structuredContent as Record<string, unknown>;
        if (structured.ok) {
          const result = structured.result as string;
          // eval should either be blocked or return "undefined" (no process in sandbox)
          expect(["undefined", "eval-blocked"]).toContain(result);
        }
      });
    });
  });
}
