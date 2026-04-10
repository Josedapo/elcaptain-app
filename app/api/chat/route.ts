import { spawn } from "child_process";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, SYSTEM_PROMPT } from "@/lib/tools";
import {
  searchAccounts,
  filterAccounts,
  getAccountDetail,
  getTopAccounts,
  getStats,
  compareAccounts,
  getMarketOverview,
} from "@/lib/data";

const MODE = process.env.ELCAPTAIN_MODE || "local";

// --- Local mode: Claude Code CLI (Max subscription) ---

const LOCAL_SYSTEM_PROMPT = `You are ElCaptain, an expert social media campaign strategist with access to a real database of 8,356 content creators, athletes, sports teams, and entertainment accounts with economic valuation data (PME — Paid Media Equivalence).

You help users plan social media campaigns by recommending creators, analyzing value efficiency, and providing data-driven insights.

## How to query data

You have a query script. Run it using Bash:

  node scripts/query-data.mjs <command> [args]

Commands:
  search <query> [--limit N]                    — Search by name or handle
  top <avgPerPost|totalValue|engRate> [--category X] [--country X] [--platform instagram|tiktok] [--limit N]  — Top accounts by metric
  detail <instagram|tiktok> <handle>            — Full details for one account
  filter [--category X] [--country X] [--platform X] [--minFollowers N] [--maxFollowers N] [--sortBy avgPerPost|totalValue|engRate|followers] [--limit N]  — Filter accounts
  compare <platform/handle> <platform/handle>   — Compare accounts side by side
  market [country] [--category X] [--platform instagram|tiktok] — Full market overview with flexible filters. Groups automatically: by category (if country given), by top countries (if category given), by platform (if both given). Use this for budget allocation and market analysis — one call replaces many.
  stats                                          — Database overview

Categories: Athletes, Entertainment, Media & Creators, Sports Teams, Sports Organizations
Platforms: instagram, tiktok

## Key metrics
- **Avg Value Per Post (USD):** The most important metric for campaign planning. This is the price a creator would charge per post — what a brand should expect to pay for a partnership activation. Calculated as totalValue / posts.
- **Total Value (USD):** The total amount a creator would charge for all their posts in the period. Represents the full cost of partnering with that account.
- **Engagement Rate (%):** Active audience percentage. Higher = more responsive audience for campaigns. Industry-standard metrics like CPM and CPE can be used in explanations.
- **Do NOT use Value Per Fan** in campaign conversations — irrelevant for campaign strategy. Always use Avg Value Per Post instead.
- **Do NOT use the term "PME" or "Paid Media Equivalence"** — it's too technical. Instead, refer to values as "what the creator would charge" or "the cost of a partnership". Industry abbreviations like CPM or CPE are fine.

## Audience and territory
- The "country" field represents the account's home country. When a user asks about reaching audiences in a specific territory (e.g., "I want to reach people in Spain"), treat country as a proxy for the account's audience geography — assume the audience comes predominantly from that country.
- **Exclude "Global" accounts** from territory-specific queries. If country is "Global", the audience territory is unknown, so these accounts should not be recommended when the user specifies a target territory.
- If the user does NOT specify a territory, Global accounts can be included.

## Campaign strategy principles
- For reach: prioritize totalValue and followers
- For engagement: prioritize engRate
- For value efficiency (best cost per post): prioritize avgPerPost — sort by avgPerPost to find creators who generate the most value per individual post
- Micro-influencers (10K-100K) often have higher engagement rates
- Always query data before recommending — never guess numbers

## Charts and visualizations
When the user asks for a chart, graph, or visual distribution:
- Generate a complete, self-contained HTML page using Chart.js from CDN (https://cdn.jsdelivr.net/npm/chart.js)
- Wrap it in a markdown code block with language "html" (triple backticks html)
- The frontend will automatically render it as an interactive chart
- Use light background colors, clean design
- Do NOT try to write files — just output the HTML in the code block
- Include all data inline in the HTML (no external files)

Be conversational, direct, and data-driven.

CRITICAL: Always respond in the SAME language the user writes in. If the user writes in English, respond in English. If the user writes in Spanish, respond in Spanish. Match the user's language exactly.`;

function callClaudeLocal(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "/Users/joseda/.local/bin/claude",
      [
        "-p",
        "--output-format", "text",
        "--model", "opus",
        "--allowedTools", "Bash(node scripts/query-data.mjs:*)",
      ],
      {
        env: (() => {
          // Pass all env vars EXCEPT ANTHROPIC_API_KEY.
          // If the API key leaks to the CLI, it uses API credits
          // instead of the Max subscription.
          const env = { ...process.env };
          delete env.ANTHROPIC_API_KEY;
          return env;
        })(),
        cwd: path.resolve(process.cwd()),
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0 && !stdout) {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.on("error", reject);

    child.stdin.write(prompt);
    child.stdin.end();

    setTimeout(() => {
      child.kill();
      reject(new Error("Claude Code timed out after 10 minutes"));
    }, 600000);
  });
}

async function handleLocal(messages: { role: string; content: string }[]): Promise<string> {
  const conversationText = messages
    .map((m) => {
      const prefix = m.role === "user" ? "User" : "Assistant";
      return `${prefix}: ${m.content}`;
    })
    .join("\n\n");

  const fullPrompt = `${LOCAL_SYSTEM_PROMPT}

## Conversation so far

${conversationText}

Respond to the user's latest message. If you need data, use Bash to run the query script (working directory: ${process.cwd()}). Always query data before making recommendations.`;

  return callClaudeLocal(fullPrompt);
}

// --- Remote mode: Anthropic SDK (API key) ---

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function executeTool(name: string, input: any): unknown {
  switch (name) {
    case "search_accounts":
      return searchAccounts(input.query, input.limit);
    case "filter_accounts":
      return filterAccounts(input);
    case "get_account_detail":
      return getAccountDetail(input.platform, input.handle);
    case "get_top_accounts":
      return getTopAccounts(input.metric, {
        category: input.category,
        country: input.country,
        platform: input.platform,
      }, input.limit);
    case "get_database_stats":
      return getStats();
    case "compare_accounts":
      return compareAccounts(input.accounts);
    case "get_market_overview":
      return getMarketOverview(input);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

const VISUAL_KEYWORDS = [
  "presentation", "presentación", "presentacion",
  "informe visual", "visual report", "report",
  "informe", "dashboard", "slide",
  "diseña", "design", "crea un informe", "create a report",
  "panoramic", "panorámico", "panoramico",
];

function needsOpus(messages: { role: string; content: string }[]): boolean {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) return false;
  const text = lastUserMsg.content.toLowerCase();
  return VISUAL_KEYWORDS.some((kw) => text.includes(kw));
}

async function handleRemote(messages: { role: string; content: string }[]): Promise<string> {
  const client = getAnthropicClient();
  const useOpus = needsOpus(messages);
  const model = useOpus ? "claude-opus-4-20250514" : "claude-sonnet-4-20250514";
  const maxTokens = useOpus ? 8192 : 4096;

  const sdkMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Mark the last user message from conversation history for multi-turn caching.
  // This caches system + tools + all prior turns, so each tool use iteration
  // only pays for the new tool results.
  if (sdkMessages.length >= 3) {
    const lastUserIdx = sdkMessages.findLastIndex((m) => m.role === "user");
    if (lastUserIdx >= 0 && typeof sdkMessages[lastUserIdx].content === "string") {
      sdkMessages[lastUserIdx] = {
        role: "user",
        content: [
          {
            type: "text",
            text: sdkMessages[lastUserIdx].content as string,
            cache_control: { type: "ephemeral" },
          },
        ],
      };
    }
  }

  let currentMessages = [...sdkMessages];
  const MAX_ITERATIONS = 10;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: TOOLS,
      messages: currentMessages,
    });

    if (response.stop_reason === "end_turn") {
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      return textBlocks.map((b) => b.text).join("\n");
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: JSON.stringify(executeTool(block.name, block.input)),
      }));

      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];

      continue;
    }

    // Unexpected stop reason — return whatever text we have
    const fallbackText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((b) => b.text)
      .join("\n");
    return fallbackText || "No response generated.";
  }

  return "The query required too many data lookups. Please try a simpler question.";
}

// --- POST handler ---

export async function POST(request: Request) {
  const { messages } = await request.json();

  // Auth check for remote mode
  if (MODE === "remote") {
    const authHeader = request.headers.get("Authorization");
    const expected = process.env.ELCAPTAIN_PASSWORD;

    if (!expected || !authHeader || authHeader !== `Bearer ${expected}`) {
      return Response.json(
        { response: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  try {
    const response = MODE === "remote"
      ? await handleRemote(messages)
      : await handleLocal(messages);

    return Response.json({ response });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { response: `Error: ${message}` },
      { status: 500 }
    );
  }
}
