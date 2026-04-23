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

import { runSummaryAgent } from "../src/managed-agent.js";

const env = {
  ANTHROPIC_API_KEY: "key",
  MANAGED_AGENT_ID: "agent_1",
  MANAGED_ENVIRONMENT_ID: "env_1",
} as any;

const input = {
  callId: "c1",
  callTitle: "Acme discovery",
  ownerEmail: "jon@fluint.io",
  attendees: [{ email: "jane@acme.com", name: "Jane" }],
  transcript: {
    callId: "c1",
    speakers: [
      { id: "s1", name: "Jon" },
      { id: "s2", name: "Jane" },
    ],
    entries: [
      { speakerId: "s1", start: 0, text: "Hi." },
      { speakerId: "s2", start: 1000, text: "Hi there." },
    ],
  },
};

beforeEach(() => {
  sessionsCreate.mockReset().mockResolvedValue({ id: "sesn_xyz" });
  eventsSend.mockReset().mockResolvedValue({});
});

describe("runSummaryAgent", () => {
  it("creates a session with the configured agent and environment IDs", async () => {
    const { sessionId } = await runSummaryAgent(env, input);
    expect(sessionId).toBe("sesn_xyz");

    const call = sessionsCreate.mock.calls[0][0];
    expect(call.agent).toEqual({ id: "agent_1", type: "agent" });
    expect(call.environment_id).toBe("env_1");
    expect(call.metadata).toEqual({ gong_call_id: "c1" });
  });

  it("sends a user.message containing the transcript and attendees", async () => {
    await runSummaryAgent(env, input);

    const [sessionId, payload] = eventsSend.mock.calls[0];
    expect(sessionId).toBe("sesn_xyz");

    const message = payload.events[0].content[0].text as string;
    expect(message).toContain("Acme discovery");
    expect(message).toContain("jane@acme.com");
    expect(message).toContain("Jon: Hi.");
    expect(message).toContain("Jane: Hi there.");
  });
});
