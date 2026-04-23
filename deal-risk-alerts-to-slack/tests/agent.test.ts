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

const env = {
  ANTHROPIC_API_KEY: "k",
  MANAGED_AGENT_ID: "agent_1",
  MANAGED_ENVIRONMENT_ID: "env_1",
  MANUAL_TRIGGER_SECRET: "secret",
} as any;

function ctx(): any {
  return { waitUntil: vi.fn((p) => p) };
}

beforeEach(() => {
  sessionsCreate.mockReset().mockResolvedValue({ id: "sesn_x" });
  eventsSend.mockReset().mockResolvedValue({});
});

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

describe("runRiskScanAgent context passing", () => {
  it("sets session metadata with today's run date", async () => {
    await triggerRun();
    const today = new Date().toISOString().slice(0, 10);
    expect(sessionsCreate.mock.calls[0][0].metadata).toEqual({ run_date: today });
  });

  it("uses default thresholds when env vars are unset", async () => {
    await triggerRun();
    const message = lastMessage();
    expect(message).toContain("Going-dark threshold: 7 days");
    expect(message).toContain("Stalled-stage threshold: 14 days");
    expect(message).toContain("Scope: all open-pipeline stages.");
  });

  it("respects configured thresholds and stage scope", async () => {
    await triggerRun({
      GOING_DARK_DAYS: "3",
      STALLED_STAGE_DAYS: "21",
      ACTIVE_STAGE_IDS: "qualifiedtobuy, presentationscheduled",
    });
    const message = lastMessage();
    expect(message).toContain("Going-dark threshold: 3 days");
    expect(message).toContain("Stalled-stage threshold: 21 days");
    expect(message).toContain("Scope: only scan deals in these stages: qualifiedtobuy, presentationscheduled.");
  });

  it("ignores empty entries in the ACTIVE_STAGE_IDS CSV", async () => {
    await triggerRun({ ACTIVE_STAGE_IDS: ",,qualifiedtobuy,," });
    expect(lastMessage()).toContain("Scope: only scan deals in these stages: qualifiedtobuy.");
  });
});
