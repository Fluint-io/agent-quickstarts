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

import { runFollowUpAgent } from "../src/managed-agent.js";

const env = {
  ANTHROPIC_API_KEY: "key",
  MANAGED_AGENT_ID: "agent_1",
  MANAGED_ENVIRONMENT_ID: "env_1",
} as any;

const baseInput = {
  callId: "c1",
  callTitle: "Acme discovery",
  callDate: "2026-04-22",
  ownerEmail: "jon@fluint.io",
  attendees: [
    { email: "jane@acme.com", name: "Jane" },
    { email: "jon@fluint.io", name: "Jon" },
  ],
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

function lastMessage(): string {
  return eventsSend.mock.calls[0][1].events[0].content[0].text as string;
}

describe("runFollowUpAgent", () => {
  it("creates a session with the configured agent and environment IDs", async () => {
    const { sessionId } = await runFollowUpAgent(env, baseInput);
    expect(sessionId).toBe("sesn_xyz");

    const call = sessionsCreate.mock.calls[0][0];
    expect(call.agent).toEqual({ id: "agent_1", type: "agent" });
    expect(call.environment_id).toBe("env_1");
    expect(call.metadata).toEqual({ gong_call_id: "c1" });
  });

  it("picks the first non-rep attendee as the primary recipient", async () => {
    await runFollowUpAgent(env, baseInput);
    expect(lastMessage()).toContain("Primary recipient: jane@acme.com");
  });

  it("picks the first customer when multiple customer attendees are present", async () => {
    await runFollowUpAgent(env, {
      ...baseInput,
      attendees: [
        { email: "jon@fluint.io" },
        { email: "first@acme.com" },
        { email: "second@acme.com" },
      ],
    });
    expect(lastMessage()).toContain("Primary recipient: first@acme.com");
  });

  it("leaves primary recipient empty when only the rep is on the call", async () => {
    await runFollowUpAgent(env, {
      ...baseInput,
      attendees: [{ email: "jon@fluint.io" }],
    });
    expect(lastMessage()).toContain("Primary recipient: \n");
  });

  it("includes the transcript plain text in the user message", async () => {
    await runFollowUpAgent(env, baseInput);
    const message = lastMessage();
    expect(message).toContain("Jon: Hi.");
    expect(message).toContain("Jane: Hi there.");
  });
});
