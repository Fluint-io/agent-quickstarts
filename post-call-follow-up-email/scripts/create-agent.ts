import Anthropic from "@anthropic-ai/sdk";
import { buildAgentParams } from "../agent/agent-definition.js";

const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";

const gmailMcpUrl = process.env.GMAIL_MCP_URL;
if (!gmailMcpUrl) {
  console.error("Set GMAIL_MCP_URL to the URL of your Gmail MCP server.");
  process.exit(1);
}

const client = new Anthropic();

const agent = await client.beta.agents.create({
  ...buildAgentParams(gmailMcpUrl),
  betas: [MANAGED_AGENTS_BETA],
});

console.log(`Created agent: ${agent.id}`);
console.log(`Set MANAGED_AGENT_ID=${agent.id} in your Worker secrets.`);
