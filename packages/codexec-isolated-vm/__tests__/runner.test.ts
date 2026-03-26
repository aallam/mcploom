import {
  createToolCallDispatcher,
  extractProviderManifests,
  resolveProvider,
} from "@mcploom/codexec";
import { describe, expect, it } from "vitest";

import { runIsolatedVmSession } from "../src/runner/index.ts";

describe("runIsolatedVmSession", () => {
  it("executes against manifests with a tool-call callback", async () => {
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        add: {
          execute: async (input) => {
            const payload = input as { x: number };
            return { sum: payload.x + 2 };
          },
        },
      },
    });
    const abortController = new AbortController();

    const result = await runIsolatedVmSession(
      {
        abortController,
        code: "(await mcp.add({ x: 2 })).sum",
        onToolCall: createToolCallDispatcher(
          [provider],
          abortController.signal,
        ),
        providers: extractProviderManifests([provider]),
      },
      {},
    );

    expect(result).toMatchObject({
      ok: true,
      result: 4,
    });
  });
});
