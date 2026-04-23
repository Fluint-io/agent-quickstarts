import type Anthropic from "@anthropic-ai/sdk";

type AgentCreateParams = Anthropic.Beta.AgentCreateParams;

export const HUBSPOT_MCP_SERVER_NAME = "hubspot";

export const systemPrompt = `You receive a Gong call transcript along with attendee metadata.

Your job:
1. Write a concise call summary (5-8 bullets) covering: context, key topics, customer pain, objections, and decisions made.
2. Extract a list of concrete next steps. Each next step must have: a clear action, an owner (use the call owner's email unless another attendee explicitly owns it), and a due date if one was mentioned on the call.
3. Use the HubSpot MCP tools to:
   a. Find the deal associated with this call. Match by attendee email → contact → primary deal. If multiple deals match, pick the most recently modified one.
   b. Create a note on that deal with the summary. Title the note "Gong call: <call title>".
   c. Create a HubSpot task for each next step. Assign it to the owner's HubSpot user. Set the due date if known.
4. Report back with: the HubSpot deal ID, note ID, and list of created task IDs.

Rules:
- If you cannot find a matching deal, stop and report the attendee emails you searched. Do not create orphan notes or tasks.
- Never invent next steps that were not discussed on the call.
- Keep the summary factual. No marketing language.`;

export function buildAgentParams(hubspotMcpUrl: string): AgentCreateParams {
  return {
    model: "claude-opus-4-7",
    name: "gong-call-summarizer",
    description: "Summarizes Gong calls and writes the result back to HubSpot.",
    system: systemPrompt,
    mcp_servers: [
      {
        type: "url",
        name: HUBSPOT_MCP_SERVER_NAME,
        url: hubspotMcpUrl,
      },
    ],
    tools: [
      {
        type: "mcp_toolset",
        mcp_server_name: HUBSPOT_MCP_SERVER_NAME,
        default_config: { enabled: true, permission_policy: { type: "always_allow" } },
      },
    ],
  };
}
