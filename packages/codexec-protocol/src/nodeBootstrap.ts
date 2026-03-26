const SOURCE_MODE_EXEC_ARGV = ["--conditions=source", "--import", "tsx"];

/**
 * Returns the extra Node flags needed to launch transport-backed child entries
 * directly from source during local development and tests.
 */
export function getNodeTransportExecArgv(moduleUrl: string): string[] | undefined {
  return moduleUrl.endsWith(".ts") ? [...SOURCE_MODE_EXEC_ARGV] : undefined;
}
