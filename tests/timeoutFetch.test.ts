import { describe, expect, it } from "vitest";
import { AgentRequestError } from "../src/agent.js";
import {
  createTimeoutFetch,
  DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS,
  parseGatewayRequestTimeout,
} from "../src/timeoutFetch.js";

function stalledFetch(): typeof fetch {
  return (async (_input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> =>
    await new Promise<Response>((_resolve, reject) => {
      const signal = init.signal;
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    })) as typeof fetch;
}

describe("gateway request timeout configuration", () => {
  it("uses a bounded default", () => {
    expect(parseGatewayRequestTimeout(undefined)).toBe(DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS);
  });

  it("accepts valid integer milliseconds", () => {
    expect(parseGatewayRequestTimeout("1500")).toBe(1500);
  });

  it("rejects malformed and out-of-range values", () => {
    expect(() => parseGatewayRequestTimeout("1.5")).toThrow(/integer/);
    expect(() => parseGatewayRequestTimeout("100")).toThrow(/between/);
    expect(() => parseGatewayRequestTimeout("999999")).toThrow(/between/);
  });
});

describe("bounded loopback fetch", () => {
  it("converts a local-agent deadline into a typed request error", async () => {
    const boundedFetch = createTimeoutFetch(250, stalledFetch());
    const error = await boundedFetch("http://127.0.0.1:43117/v1/status").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentRequestError);
    expect(error).toMatchObject({ status: 504, code: "agent_request_timeout" });
  });

  it("preserves cancellation initiated by the caller", async () => {
    const boundedFetch = createTimeoutFetch(5_000, stalledFetch());
    const controller = new AbortController();
    const request = boundedFetch("http://127.0.0.1:43117/v1/status", { signal: controller.signal });
    controller.abort(new DOMException("caller cancelled", "AbortError"));

    const error = await request.catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(AgentRequestError);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  it("passes through successful responses", async () => {
    const boundedFetch = createTimeoutFetch(
      1_000,
      (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch,
    );

    const response = await boundedFetch("http://127.0.0.1:43117/v1/status");
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ ok: true });
  });
});
