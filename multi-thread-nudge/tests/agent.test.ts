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

describe("runMultiThreadAgent context passing", () => {
  it("applies defaults when env vars are unset", async () => {
    await triggerRun();
    const message = lastMessage();
    expect(message).toContain("Minimum days in stage: 5");
    expect(message).toContain("Max stakeholder drafts per deal: 3");
    expect(message).toContain("Scope: all late-stage open deals.");
  });

  it("passes configured stage list and thresholds", async () => {
    await triggerRun({
      WATCHED_STAGE_IDS: "contractsent",
      MIN_DAYS_IN_STAGE: "10",
      MAX_DRAFTS_PER_DEAL: "2",
    });
    const message = lastMessage();
    expect(message).toContain("Minimum days in stage: 10");
    expect(message).toContain("Max stakeholder drafts per deal: 2");
    expect(message).toContain("Watched stages: contractsent.");
  });

  it("attaches the run date to session metadata", async () => {
    await triggerRun();
    const today = new Date().toISOString().slice(0, 10);
    expect(sessionsCreate.mock.calls[0][0].metadata).toEqual({ run_date: today });
  });
});
