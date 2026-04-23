import Anthropic from "@anthropic-ai/sdk";
import { buildAgentParams } from "../agent/agent-definition.js";

const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";

const hubspotMcpUrl = process.env.HUBSPOT_MCP_URL;
const slackMcpUrl = process.env.SLACK_MCP_URL;

if (!hubspotMcpUrl || !slackMcpUrl) {
  console.error("Set HUBSPOT_MCP_URL and SLACK_MCP_URL to your MCP server URLs.");
  process.exit(1);
}

const client = new Anthropic();

const agent = await client.beta.agents.create({
  ...buildAgentParams(hubspotMcpUrl, slackMcpUrl),
  betas: [MANAGED_AGENTS_BETA],
});

console.log(`Created agent: ${agent.id}`);
console.log(`Set MANAGED_AGENT_ID=${agent.id} in your Worker secrets.`);
