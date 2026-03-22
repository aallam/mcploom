import { resolveProvider } from "@mcploom/codexec";
import { IsolatedVmExecutor } from "@mcploom/codexec-isolated-vm";

async function main(): Promise<void> {
  const provider = resolveProvider({
    tools: {
      echo: {
        execute: async (input) => input,
      },
    },
  });

  const executor = new IsolatedVmExecutor();
  const result = await executor.execute("await codemode.echo({ ok: true })", [
    provider,
  ]);

  if (!result.ok) {
    throw new Error(
      `isolated-vm example failed: ${result.error.code}: ${result.error.message}`,
    );
  }

  console.log("isolated-vm example result");
  console.log(JSON.stringify(result, null, 2));
}

void main();
