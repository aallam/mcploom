import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";

import type { Executor } from "@mcploom/codexec";
import { codeMcpServer } from "@mcploom/codexec/mcp";

export type PenetrationExecutorOptions = {
  maxLogChars?: number;
  maxLogLines?: number;
  timeoutMs?: number;
};

export type PenetrationExecutorFactory = (
  options?: PenetrationExecutorOptions,
) => Executor;

export type HostileMcpHarness = {
  state: {
    waitUntilAbortAborted: boolean;
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

function createUpstreamServer(state: HostileMcpHarness["state"]): McpServer {
  const server = new McpServer({
    name: "penetration-upstream",
    version: "1.0.0",
  });
  const tool = registerTool(server);

  tool(
    "math-add",
    {
      description: "Add two safe numbers.",
      inputSchema: {
        left: z.number(),
        right: z.number(),
      },
      outputSchema: {
        sum: z.number(),
      },
    },
    async (args: { left: number; right: number }) => ({
      content: [{ text: String(args.left + args.right), type: "text" }],
      structuredContent: {
        sum: args.left + args.right,
      },
    }),
  );

  tool(
    "search-docs",
    {
      description: "Return a value from an adversarially named tool.",
      inputSchema: {
        value: z.number(),
      },
      outputSchema: {
        value: z.number(),
      },
    },
    async (args: { value: number }) => ({
      content: [{ text: String(args.value), type: "text" }],
      structuredContent: {
        value: args.value,
      },
    }),
  );

  tool(
    "search_docs",
    {
      description: "Return a value from a collidingly sanitized tool.",
      inputSchema: {
        value: z.number(),
      },
      outputSchema: {
        value: z.number(),
      },
    },
    async (args: { value: number }) => ({
      content: [{ text: String(args.value), type: "text" }],
      structuredContent: {
        value: args.value,
      },
    }),
  );

  tool(
    "default",
    {
      description: "Return a value from a reserved-word tool name.",
      inputSchema: {
        value: z.number(),
      },
      outputSchema: {
        value: z.number(),
      },
    },
    async (args: { value: number }) => ({
      content: [{ text: String(args.value), type: "text" }],
      structuredContent: {
        value: args.value,
      },
    }),
  );

  tool(
    "1tool",
    {
      description: "Return a value from a number-prefixed tool name.",
      inputSchema: {
        value: z.number(),
      },
      outputSchema: {
        value: z.number(),
      },
    },
    async (args: { value: number }) => ({
      content: [{ text: String(args.value), type: "text" }],
      structuredContent: {
        value: args.value,
      },
    }),
  );

  tool(
    "wait-until-abort",
    {
      description: "Hang until the request is cancelled.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: { signal: AbortSignal }) =>
      await new Promise((_resolve, reject) => {
        extra.signal.addEventListener(
          "abort",
          () => {
            state.waitUntilAbortAborted = true;
            reject(new Error("aborted"));
          },
          { once: true },
        );
      }),
  );

  tool(
    "large-payload",
    {
      description: "Return a moderate payload for amplification probes.",
      inputSchema: {
        count: z.number().int().min(1).max(512),
      },
      outputSchema: {
        items: z.array(z.number()),
      },
    },
    async (args: { count: number }) => ({
      content: [{ text: `generated ${args.count}`, type: "text" }],
      structuredContent: {
        items: Array.from({ length: args.count }, (_unused, index) => index),
      },
    }),
  );

  return server;
}

async function connectClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: "penetration-client",
    version: "1.0.0",
  });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return client;
}

export async function createHostileMcpHarness(
  createExecutor: PenetrationExecutorFactory,
  executorOptions?: PenetrationExecutorOptions,
): Promise<HostileMcpHarness> {
  const state = {
    waitUntilAbortAborted: false,
  };
  const upstreamClient = await connectClient(createUpstreamServer(state));
  const wrappedServer = await codeMcpServer(
    { client: upstreamClient },
    {
      executor: createExecutor(executorOptions),
    },
  );

  return {
    state,
    wrappedClient: await connectClient(wrappedServer),
  };
}
