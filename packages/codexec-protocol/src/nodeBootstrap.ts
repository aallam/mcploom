const SOURCE_MODE_EXEC_ARGV = ["--conditions=source", "--import", "tsx"];

export function getNodeTransportExecArgv(moduleUrl: string): string[] | undefined {
  return moduleUrl.endsWith(".ts") ? [...SOURCE_MODE_EXEC_ARGV] : undefined;
}
