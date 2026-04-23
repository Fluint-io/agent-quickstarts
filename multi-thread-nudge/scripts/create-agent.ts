import Anthropic from "@anthropic-ai/sdk";
import { buildAgentParams } from "../agent/agent-definition.js";

const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";

const hubspotMcpUrl = process.env.HUBSPOT_MCP_URL;
const gmailMcpUrl = process.env.GMAIL_MCP_URL;
const slackMcpUrl = process.env.SLACK_MCP_URL;
const researchMcpUrl = process.env.RESEARCH_MCP_URL || undefined;

if (!hubspotMcpUrl || !gmailMcpUrl || !slackMcpUrl) {
  console.error("Set HUBSPOT_MCP_URL, GMAIL_MCP_URL, and SLACK_MCP_URL to your MCP server URLs.");
  console.error("RESEARCH_MCP_URL is optional (used for stakeholder enrichment).");
  process.exit(1);
}

const client = new Anthropic();

const agent = await client.beta.agents.create({
  ...buildAgentParams({ hubspotMcpUrl, gmailMcpUrl, slackMcpUrl, researchMcpUrl }),
  betas: [MANAGED_AGENTS_BETA],
});

console.log(`Created agent: ${agent.id}`);
console.log(`Set MANAGED_AGENT_ID=${agent.id} in your Worker secrets.`);
