import { runMultiThreadAgent } from "./managed-agent.js";

export interface Env {
  ANTHROPIC_API_KEY: string;
  MANAGED_AGENT_ID: string;
  MANAGED_ENVIRONMENT_ID: string;
  WATCHED_STAGE_IDS?: string;
  MIN_DAYS_IN_STAGE?: string;
  MAX_DRAFTS_PER_DEAL?: string;
  MANUAL_TRIGGER_SECRET?: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runMultiThreadAgent(env, runContext(env)));
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    const provided = request.headers.get("x-trigger-secret");
    if (!env.MANUAL_TRIGGER_SECRET || provided !== env.MANUAL_TRIGGER_SECRET) {
      return json({ error: "forbidden" }, 403);
    }

    const result = await runMultiThreadAgent(env, runContext(env));
    return json({ ok: true, sessionId: result.sessionId });
  },
};

function runContext(env: Env) {
  return {
    watchedStageIds: (env.WATCHED_STAGE_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    minDaysInStage: Number(env.MIN_DAYS_IN_STAGE ?? "5"),
    maxDraftsPerDeal: Number(env.MAX_DRAFTS_PER_DEAL ?? "3"),
    today: new Date().toISOString().slice(0, 10),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
