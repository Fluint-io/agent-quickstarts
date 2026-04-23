import { describe, it, expect, vi, beforeEach } from "vitest";

const { sessionsCreate, eventsSend } = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  eventsSend: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    beta: {
      sessions: {
        create: sessionsCreate,
        events: { send: eventsSend },
      },
    },
  })),
}));

import worker from "../src/index.js";

const baseEnv = {
  ANTHROPIC_API_KEY: "test-key",
  MANAGED_AGENT_ID: "agent_test",
  MANAGED_ENVIRONMENT_ID: "env_test",
  GOING_DARK_DAYS: "7",
  STALLED_STAGE_DAYS: "14",
  ACTIVE_STAGE_IDS: "",
  MANUAL_TRIGGER_SECRET: "trigger-secret",
} as any;

function ctx(): any {
  return { waitUntil: vi.fn((p) => p) };
}

beforeEach(() => {
  sessionsCreate.mockReset().mockResolvedValue({ id: "sesn_abc" });
  eventsSend.mockReset().mockResolvedValue({});
});

describe("scheduled handler", () => {
  it("opens a Managed Agent session when the cron fires", async () => {
    const c = ctx();
    await worker.scheduled({} as any, baseEnv, c);
    // waitUntil wraps the agent call — resolve the wrapped promise to force it.
    await c.waitUntil.mock.results[0].value;
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    expect(eventsSend).toHaveBeenCalledTimes(1);
  });
});

describe("manual POST trigger", () => {
  function req(headers: Record<string, string> = {}): Request {
    return new Request("https://example.com", { method: "POST", headers });
  }

  it("rejects non-POST methods with 405", async () => {
    const res = await worker.fetch(
      new Request("https://example.com", { method: "GET" }),
      baseEnv,
      ctx(),
    );
    expect(res.status).toBe(405);
  });

  it("returns 403 when MANUAL_TRIGGER_SECRET is not configured", async () => {
    const env = { ...baseEnv, MANUAL_TRIGGER_SECRET: undefined };
    const res = await worker.fetch(req({ "x-trigger-secret": "anything" }), env, ctx());
    expect(res.status).toBe(403);
  });

  it("returns 403 when the wrong secret is supplied", async () => {
    const res = await worker.fetch(req({ "x-trigger-secret": "wrong" }), baseEnv, ctx());
    expect(res.status).toBe(403);
  });

  it("runs the agent when the correct secret is supplied", async () => {
    const res = await worker.fetch(
      req({ "x-trigger-secret": baseEnv.MANUAL_TRIGGER_SECRET }),
      baseEnv,
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sessionId: "sesn_abc" });
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });
});
