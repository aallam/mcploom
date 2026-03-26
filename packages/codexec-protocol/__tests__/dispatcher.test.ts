import { describe, expect, it } from "vitest";

import { getExecutionTimeoutMessage, resolveProvider } from "@mcploom/codexec";

import { createToolCallDispatcher } from "../src/dispatcher";

describe("createToolCallDispatcher", () => {
  it("does not start new host tool work after the execution has been aborted", async () => {
    const abortController = new AbortController();
    let called = false;
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        hang: {
          execute: async () => {
            called = true;
            return "should not run";
          },
        },
      },
    });
    const dispatch = createToolCallDispatcher(
      [provider],
      abortController.signal,
    );

    abortController.abort();
    const result = await dispatch({
      input: {},
      providerName: "mcp",
      safeToolName: "hang",
    });

    expect(called).toBe(false);
    expect(result).toEqual({
      error: {
        code: "timeout",
        message: getExecutionTimeoutMessage(),
      },
      ok: false,
    });
  });
});
