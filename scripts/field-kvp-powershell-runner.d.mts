export function runPowerShell(
  script: string,
  environment?: Readonly<Record<string, string>>,
): Promise<string>;

export default runPowerShell;
