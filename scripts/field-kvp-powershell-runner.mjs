import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * The one implementation that actually spawns `powershell.exe` for a guest KVP read.
 *
 * It lives here rather than in `src/` deliberately. Every module under `src/` is treated as
 * security-relevant and the repository validator forbids process execution there outright, so the
 * decision logic in `src/fieldKvpHyperVReader.ts` stays a pure function of its inputs and the
 * process boundary is reviewed on its own.
 *
 * This function chooses nothing. It does not build the script, does not know what a Field VM is,
 * and does not interpret the output. It runs the script it is handed, with the environment it is
 * handed, and returns stdout unmodified.
 */

const execFileAsync = promisify(execFile);

/**
 * @param {string} script PowerShell to execute. Supplied by the caller; never built here.
 * @param {Readonly<Record<string, string>>} environment Overlay applied on top of the process
 *   environment. The Field VM name arrives this way so it never enters the script text and there
 *   is no quoting to get wrong.
 * @returns {Promise<string>} Raw stdout.
 */
export async function runPowerShell(script, environment = {}) {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      env: { ...process.env, ...environment },
      // A guest exchange is small. A generous buffer here would only hide a runaway response.
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      timeout: 60_000,
    },
  );
  return stdout;
}

export default runPowerShell;
