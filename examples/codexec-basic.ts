import { resolveProvider } from "@mcploom/codexec";
import { QuickJsExecutor } from "@mcploom/codexec-quickjs";

async function main(): Promise<void> {
  const provider = resolveProvider({
    name: "tools",
    tools: {
      add: {
        description: "Add two numbers together.",
        inputSchema: {
          type: "object",
          required: ["x", "y"],
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
        },
        execute: async (input) => {
          const { x, y } = input as { x: number; y: number };
          return { sum: x + y };
        },
      },
      logValue: {
        description: "Echo a message for console capture.",
        inputSchema: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
          },
        },
        execute: async (input) => {
          const { message } = input as { message: string };
          return { message };
        },
      },
    },
  });

  const executor = new QuickJsExecutor();
  const result = await executor.execute(
    `
      const sum = await tools.add({ x: 2, y: 5 });
      const echoed = await tools.logValue({ message: "captured from sandbox" });
      console.log(echoed.message);
      ({ sum: sum.sum });
    `,
    [provider],
  );

  console.log("core example result");
  console.log(JSON.stringify(result, null, 2));
}

void main();
