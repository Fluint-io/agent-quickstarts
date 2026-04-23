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
  ANTHROPIC_API_KEY: "k",
  MANAGED_AGENT_ID: "agent_1",
  MANAGED_ENVIRONMENT_ID: "env_1",
  WATCHED_STAGE_IDS: "presentationscheduled,decisionmakerboughtin,contractsent",
  MIN_DAYS_IN_STAGE: "5",
  MAX_DRAFTS_PER_DEAL: "3",
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
  it("opens a session on cron fire", async () => {
    const c = ctx();
    await worker.scheduled({} as any, baseEnv, c);
    await c.waitUntil.mock.results[0].value;
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
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

  it("returns 403 without the correct secret", async () => {
    const res = await worker.fetch(req({ "x-trigger-secret": "wrong" }), baseEnv, ctx());
    expect(res.status).toBe(403);
  });

  it("runs the agent with the correct secret", async () => {
    const res = await worker.fetch(
      req({ "x-trigger-secret": baseEnv.MANUAL_TRIGGER_SECRET }),
      baseEnv,
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sessionId: "sesn_abc" });
  });
});
