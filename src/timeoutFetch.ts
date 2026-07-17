import { AgentRequestError } from "./agent.js";

export const DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS = 20_000;
export const MIN_GATEWAY_REQUEST_TIMEOUT_MS = 250;
export const MAX_GATEWAY_REQUEST_TIMEOUT_MS = 120_000;

export function parseGatewayRequestTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error("EXOSUIT_GATEWAY_REQUEST_TIMEOUT_MS must be an integer number of milliseconds.");
  }
  if (parsed < MIN_GATEWAY_REQUEST_TIMEOUT_MS || parsed > MAX_GATEWAY_REQUEST_TIMEOUT_MS) {
    throw new Error(
      `EXOSUIT_GATEWAY_REQUEST_TIMEOUT_MS must be between ${MIN_GATEWAY_REQUEST_TIMEOUT_MS} and ${MAX_GATEWAY_REQUEST_TIMEOUT_MS}.`,
    );
  }
  return parsed;
}

export function createTimeoutFetch(timeoutMs: number, baseFetch: typeof fetch = fetch): typeof fetch {
  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_GATEWAY_REQUEST_TIMEOUT_MS || timeoutMs > MAX_GATEWAY_REQUEST_TIMEOUT_MS) {
    throw new Error(
      `Gateway request timeout must be an integer between ${MIN_GATEWAY_REQUEST_TIMEOUT_MS} and ${MAX_GATEWAY_REQUEST_TIMEOUT_MS} milliseconds.`,
    );
  }

  return (async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const callerSignal = init.signal ?? undefined;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;

    try {
      return await baseFetch(input, { ...init, signal });
    } catch (error) {
      if (timeoutSignal.aborted && !callerSignal?.aborted) {
        throw new AgentRequestError(
          `The local Exosuit agent did not respond within ${timeoutMs} ms.`,
          504,
          "agent_request_timeout",
        );
      }
      throw error;
    }
  }) as typeof fetch;
}
