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
  HUBSPOT_WEBHOOK_SECRET: "webhook-secret",
  TRIGGER_STAGE_IDS: "presentationscheduled,decisionmakerboughtin",
  DRIVE_FOLDER_ID: "folder_123",
} as any;

function ctx(): any {
  return { waitUntil: vi.fn() };
}

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  let counter = 0;
  sessionsCreate.mockReset().mockImplementation(async () => ({ id: `sesn_${++counter}` }));
  eventsSend.mockReset().mockResolvedValue({});
});

describe("Worker fetch handler", () => {
  it("rejects non-POST methods with 405", async () => {
    const res = await worker.fetch(
      new Request("https://example.com", { method: "GET" }),
      env,
      ctx(),
    );
    expect(res.status).toBe(405);
  });

  it("rejects bad signatures with 401", async () => {
    const res = await worker.fetch(
      req([], { "x-hubspot-signature-v3": "nope" }),
      env,
      ctx(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 500 if DRIVE_FOLDER_ID isn't configured", async () => {
    const res = await worker.fetch(
      req([], { "x-hubspot-signature-v3": env.HUBSPOT_WEBHOOK_SECRET }),
      { ...env, DRIVE_FOLDER_ID: "" },
      ctx(),
    );
    expect(res.status).toBe(500);
  });

  it("matches zero events when nothing in the payload fits the trigger", async () => {
    const res = await worker.fetch(
      req(
        [
          {
            subscriptionType: "deal.propertyChange",
            objectId: 1,
            propertyName: "amount",
            propertyValue: "1000",
          },
          {
            subscriptionType: "deal.propertyChange",
            objectId: 2,
            propertyName: "dealstage",
            propertyValue: "qualifiedtobuy",
          },
        ],
        { "x-hubspot-signature-v3": env.HUBSPOT_WEBHOOK_SECRET },
      ),
      env,
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, matched: 0 });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("opens a session for each matched stage-change event", async () => {
    const res = await worker.fetch(
      req(
        [
          {
            subscriptionType: "deal.propertyChange",
            objectId: 111,
            propertyName: "dealstage",
            propertyValue: "presentationscheduled",
          },
          {
            subscriptionType: "deal.propertyChange",
            objectId: 222,
            propertyName: "dealstage",
            propertyValue: "decisionmakerboughtin",
          },
          {
            subscriptionType: "deal.propertyChange",
            objectId: 333,
            propertyName: "dealstage",
            propertyValue: "contractsent",
          },
        ],
        { "x-hubspot-signature-v3": env.HUBSPOT_WEBHOOK_SECRET },
      ),
      env,
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.matched).toBe(2);
    expect(body.sessions).toEqual(["sesn_1", "sesn_2"]);
    expect(sessionsCreate).toHaveBeenCalledTimes(2);
  });
});
