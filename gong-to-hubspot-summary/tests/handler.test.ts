import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted so the mock factory below can reference them safely.
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

const env = {
  ANTHROPIC_API_KEY: "test-key",
  MANAGED_AGENT_ID: "agent_test",
  MANAGED_ENVIRONMENT_ID: "env_test",
  GONG_ACCESS_KEY: "k",
  GONG_ACCESS_KEY_SECRET: "s",
  GONG_WEBHOOK_SECRET: "secret123",
} as any;

const ctx = (): any => ({ waitUntil: vi.fn() });
const fetchMock = vi.fn();

beforeEach(() => {
  sessionsCreate.mockReset().mockResolvedValue({ id: "sesn_abc" });
  eventsSend.mockReset().mockResolvedValue({});
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function req(init: RequestInit = {}): Request {
  return new Request("https://example.com", init);
}

function gongTranscriptResponse() {
  return {
    ok: true,
    json: async () => ({
      callTranscripts: [
        {
          callId: "c1",
          parties: [{ id: "s1", name: "Jon" }],
          transcript: [
            { speakerId: "s1", sentences: [{ start: 0, text: "Hi." }] },
          ],
        },
      ],
    }),
  };
}

describe("Worker fetch handler", () => {
  it("rejects non-POST methods with 405", async () => {
    const res = await worker.fetch(req({ method: "GET" }), env, ctx());
    expect(res.status).toBe(405);
  });

  it("rejects a request with no signature header", async () => {
    const res = await worker.fetch(
      req({ method: "POST", body: JSON.stringify({}) }),
      env,
      ctx(),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a request whose signature does not match the configured secret", async () => {
    const res = await worker.fetch(
      req({
        method: "POST",
        headers: { "x-gong-signature": "nope" },
        body: JSON.stringify({}),
      }),
      env,
      ctx(),
    );
    expect(res.status).toBe(401);
  });

  it("rejects events that are not 'call_ended' with 400", async () => {
    const res = await worker.fetch(
      req({
        method: "POST",
        headers: { "x-gong-signature": env.GONG_WEBHOOK_SECRET },
        body: JSON.stringify({ eventType: "call_started", callId: "c1" }),
      }),
      env,
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("fetches the transcript and opens a Managed Agent session on the happy path", async () => {
    fetchMock.mockResolvedValueOnce(gongTranscriptResponse());

    const res = await worker.fetch(
      req({
        method: "POST",
        headers: { "x-gong-signature": env.GONG_WEBHOOK_SECRET },
        body: JSON.stringify({
          eventType: "call_ended",
          callId: "c1",
          title: "Acme discovery",
          ownerEmail: "jon@fluint.io",
          attendees: [
            { email: "jane@acme.com", name: "Jane" },
            { email: "jon@fluint.io", name: "Jon" },
          ],
        }),
      }),
      env,
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sessionId: "sesn_abc" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    expect(eventsSend).toHaveBeenCalledTimes(1);
  });
});
