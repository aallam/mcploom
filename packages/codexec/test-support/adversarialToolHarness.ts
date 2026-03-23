import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";

import type { Executor } from "@mcploom/codexec";
import { codeMcpServer } from "@mcploom/codexec/mcp";

import type { PenetrationExecutorFactory, PenetrationExecutorOptions } from "./hostileMcpHarness";

export type AdversarialHarness = {
  state: {
    callCount: number;
  };
  wrappedClient: Client;
};

const registerTool = (
  server: McpServer,
): ((
  name: string,
  config: {
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  },
  handler: (...args: never[]) => Promise<unknown>,
) => void) =>
  server.registerTool.bind(server) as unknown as (
    name: string,
    config: {
      description?: string;
      inputSchema?: unknown;
      outputSchema?: unknown;
    },
    handler: (...args: never[]) => Promise<unknown>,
  ) => void;

function createAdversarialUpstreamServer(
  state: AdversarialHarness["state"],
): McpServer {
  const server = new McpServer({
    name: "adversarial-upstream",
    version: "1.0.0",
  });
  const tool = registerTool(server);

  tool(
    "proto-inject",
    {
      description: "Returns a payload with __proto__ key to test prototype pollution.",
      inputSchema: {},
    },
    async () => ({
      content: [{ text: "proto-inject result", type: "text" }],
      structuredContent: JSON.parse('{"__proto__": {"polluted": true}, "safe": "value"}'),
    }),
  );

  tool(
    "unicode-edge",
    {
      description: "Returns adversarial unicode strings.",
      inputSchema: {},
    },
    async () => ({
      content: [{ text: "unicode-edge result", type: "text" }],
      structuredContent: {
        lineSeparator: "\u2028",
        paragraphSeparator: "\u2029",
        nullByte: "\u0000",
        injection: '"); globalThis.__pwned = true; ("',
        backtick: "`${globalThis.__pwned = true}`",
        emoji: "\uD83D\uDE00",
      },
    }),
  );

  tool(
    "slow-tool",
    {
      description: "Delays by 10ms then returns. Used for concurrent amplification.",
      inputSchema: {},
    },
    async () => {
      state.callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        content: [{ text: "slow-tool done", type: "text" }],
        structuredContent: { count: state.callCount },
      };
    },
  );

  tool(
    "large-result",
    {
      description: "Returns a string of configurable size.",
      inputSchema: {
        sizeKb: z.number().int().min(1).max(5000),
      },
    },
    async (args: { sizeKb: number }) => {
      const payload = "x".repeat(args.sizeKb * 1024);
      return {
        content: [{ text: `generated ${args.sizeKb}KB`, type: "text" }],
        structuredContent: { payload },
      };
    },
  );

  tool(
    "echo",
    {
      description: "Returns whatever value was given.",
      inputSchema: {
        value: z.unknown(),
      },
    },
    async (args: { value: unknown }) => ({
      content: [{ text: JSON.stringify(args.value), type: "text" }],
      structuredContent: { value: args.value },
    }),
  );

  tool(
    "math-add",
    {
      description: "Add two numbers.",
      inputSchema: {
        left: z.number(),
        right: z.number(),
      },
    },
    async (args: { left: number; right: number }) => ({
      content: [{ text: String(args.left + args.right), type: "text" }],
      structuredContent: { sum: args.left + args.right },
    }),
  );

  return server;
}

async function connectClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: "adversarial-client",
    version: "1.0.0",
  });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return client;
}

export async function createAdversarialHarness(
  createExecutor: PenetrationExecutorFactory,
  executorOptions?: PenetrationExecutorOptions,
): Promise<AdversarialHarness> {
  const state = {
    callCount: 0,
  };
  const upstreamClient = await connectClient(
    createAdversarialUpstreamServer(state),
  );
  const wrappedServer = await codeMcpServer(
    { client: upstreamClient },
    {
      executor: createExecutor(executorOptions),
      maxTextChars: 1000,
    },
  );

  return {
    state,
    wrappedClient: await connectClient(wrappedServer),
  };
}
