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

import { runChampionKitAgent } from "../src/managed-agent.js";

const env = {
  ANTHROPIC_API_KEY: "k",
  MANAGED_AGENT_ID: "agent_1",
  MANAGED_ENVIRONMENT_ID: "env_1",
} as any;

beforeEach(() => {
  sessionsCreate.mockReset().mockResolvedValue({ id: "sesn_xyz" });
  eventsSend.mockReset().mockResolvedValue({});
});

describe("runChampionKitAgent", () => {
  it("tags the session with the deal ID and trigger stage", async () => {
    await runChampionKitAgent(env, {
      dealId: "deal_42",
      newStage: "presentationscheduled",
      driveFolderId: "folder_abc",
    });

    const metadata = sessionsCreate.mock.calls[0][0].metadata;
    expect(metadata).toEqual({
      hubspot_deal_id: "deal_42",
      trigger_stage: "presentationscheduled",
    });
  });

  it("passes deal context and Drive folder to the agent", async () => {
    await runChampionKitAgent(env, {
      dealId: "deal_42",
      newStage: "decisionmakerboughtin",
      driveFolderId: "folder_abc",
    });

    const message = eventsSend.mock.calls[0][1].events[0].content[0].text as string;
    expect(message).toContain("Deal ID: deal_42");
    expect(message).toContain("stage: decisionmakerboughtin");
    expect(message).toContain("Google Drive folder to drop the kit into: folder_abc");
  });
});
