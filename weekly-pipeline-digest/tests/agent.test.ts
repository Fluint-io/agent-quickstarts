import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  ANTHROPIC_API_KEY: "k",
  MANAGED_AGENT_ID: "agent_1",
  MANAGED_ENVIRONMENT_ID: "env_1",
  DIGEST_SLACK_CHANNEL: "C0123456789",
  WINDOW_DAYS: "7",
  MANUAL_TRIGGER_SECRET: "secret",
} as any;

function ctx(): any {
  return { waitUntil: vi.fn((p) => p) };
}

async function triggerRun(extraEnv: Record<string, unknown> = {}) {
  await worker.fetch(
    new Request("https://example.com", {
      method: "POST",
      headers: { "x-trigger-secret": "secret" },
    }),
    { ...env, ...extraEnv },
    ctx(),
  );
}

function lastMessage(): string {
  return eventsSend.mock.calls[0][1].events[0].content[0].text as string;
}

beforeEach(() => {
  sessionsCreate.mockReset().mockResolvedValue({ id: "sesn_x" });
  eventsSend.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runDigestAgent context passing", () => {
  it("sets session metadata with the window start date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00Z"));

    await triggerRun();
    // 7 days before 2026-04-22 is 2026-04-15.
    expect(sessionsCreate.mock.calls[0][0].metadata).toEqual({
      digest_week_of: "2026-04-15",
    });
  });

  it("includes the Slack channel and window in the user message", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00Z"));

    await triggerRun();
    const message = lastMessage();
    expect(message).toContain("Post the digest to Slack channel: C0123456789");
    expect(message).toContain("Week window: 2026-04-15 → 2026-04-22 (7 days).");
  });

  it("honors a custom WINDOW_DAYS value", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00Z"));

    await triggerRun({ WINDOW_DAYS: "30" });
    expect(lastMessage()).toContain("Week window: 2026-03-23 → 2026-04-22 (30 days).");
  });
});
