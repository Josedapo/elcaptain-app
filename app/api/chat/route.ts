import { spawn } from "child_process";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS_GLOBAL, TOOLS_USMAJORS } from "@/lib/tools";
import {
  SYSTEM_PROMPT_GLOBAL,
  SYSTEM_PROMPT_USMAJORS,
  LOCAL_SYSTEM_PROMPT_GLOBAL,
  LOCAL_SYSTEM_PROMPT_USMAJORS,
} from "@/lib/prompts";
import {
  searchAccounts,
  filterAccounts,
  getAccountDetail,
  getTopAccounts,
  getStats,
  compareAccounts,
  getMarketOverview,
} from "@/lib/data";
import {
  searchPosts,
  getTopPosts,
  getPostsByAccount,
  getSponsorshipOpportunities,
  getContentSeriesStats,
  getBrandStats,
  getLeagueStats,
  getPostsStats,
  getAccountsAggregate,
} from "@/lib/posts";

const MODE = process.env.ELCAPTAIN_MODE || "local";

type ChatMode = "global" | "usmajors";

function resolveMode(input: unknown): ChatMode {
  return input === "usmajors" ? "usmajors" : "global";
}

function detectLanguage(text: string): "spanish" | "english" {
  const t = text.toLowerCase();
  // Spanish-specific characters
  if (/[áéíóúñü¿¡]/.test(t)) return "spanish";
  // Spanish common stop words / question starters
  const spanishCues = [
    " qué", " cuál", " cuáles", " cómo", " dónde", " cuándo", " quién",
    "dime ", "dame ", "muéstra", "muestra", "muéstrame", "muestrame",
    " los ", " las ", " del ", " para ", " porque", " entonces",
    " gracias", " hola", " buenos", " buenas", " perfecto",
    " sí ", " sí.", " sí,", " quiero",
  ];
  if (spanishCues.some((w) => t.includes(w))) return "spanish";
  return "english";
}

function languageDirective(text: string): string {
  const lang = detectLanguage(text);
  return lang === "spanish"
    ? "The user's last message is in SPANISH. Reply ENTIRELY in Spanish."
    : "The user's last message is in ENGLISH. Reply ENTIRELY in English.";
}

// --- Local mode: Claude Code CLI (Max subscription) ---

function callClaudeLocal(prompt: string, chatMode: ChatMode): Promise<string> {
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
          const env = { ...process.env };
          delete env.ANTHROPIC_API_KEY;
          env.ELCAPTAIN_CHAT_MODE = chatMode;
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

async function handleLocal(
  messages: { role: string; content: string }[],
  chatMode: ChatMode,
): Promise<string> {
  const conversationText = messages
    .map((m) => {
      const prefix = m.role === "user" ? "User" : "Assistant";
      return `${prefix}: ${m.content}`;
    })
    .join("\n\n");

  const baseSystemPrompt =
    chatMode === "usmajors"
      ? LOCAL_SYSTEM_PROMPT_USMAJORS
      : LOCAL_SYSTEM_PROMPT_GLOBAL;

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const langHint = lastUser ? languageDirective(lastUser.content) : "";
  const systemPrompt = langHint
    ? `${langHint}\n\n${baseSystemPrompt}`
    : baseSystemPrompt;

  const scopeHint =
    chatMode === "usmajors"
      ? "When you run account commands (search/top/filter/detail/stats), pass --mode usmajors to scope to NFL/NBA/MLB accounts."
      : "";

  const fullPrompt = `${systemPrompt}

## Conversation so far

${conversationText}

Respond to the user's latest message. If you need data, use Bash to run the query script (working directory: ${process.cwd()}). ${scopeHint} Always query data before making recommendations.

${langHint}`;

  return callClaudeLocal(fullPrompt, chatMode);
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
function executeTool(name: string, input: any, chatMode: ChatMode): unknown {
  const scope = chatMode === "usmajors" ? "usmajors" : "global";
  switch (name) {
    case "search_accounts":
      return searchAccounts(input.query, input.limit, scope);
    case "filter_accounts":
      return filterAccounts({ ...input, scope });
    case "get_account_detail":
      return getAccountDetail(input.platform, input.handle, scope);
    case "get_top_accounts":
      return getTopAccounts(input.metric, {
        category: input.category,
        country: input.country,
        platform: input.platform,
        scope,
      }, input.limit);
    case "get_database_stats":
      return getStats(scope);
    case "compare_accounts":
      return compareAccounts(input.accounts, scope);
    case "get_market_overview":
      return getMarketOverview({ ...input, scope });
    // Posts tools — only available in usmajors mode
    case "get_top_posts":
      return getTopPosts(input.metric, {
        league: input.league,
        sponsored: input.sponsored,
        brand: input.brand,
        contentSeries: input.contentSeries,
      }, input.limit);
    case "get_posts_by_account":
      return getPostsByAccount(input.handle, input.limit);
    case "get_sponsorship_opportunities":
      return getSponsorshipOpportunities({
        league: input.league,
        contentSeries: input.contentSeries,
        handle: input.handle,
      }, input.limit);
    case "get_content_series_stats":
      return getContentSeriesStats({
        league: input.league,
        handle: input.handle,
      });
    case "get_brand_stats":
      return getBrandStats(input.brand);
    case "get_league_stats":
      return getLeagueStats(input.league);
    case "get_posts_dataset_stats":
      return getPostsStats();
    case "search_posts":
      return searchPosts(input.query, input.limit);
    case "get_accounts_aggregate_from_posts":
      return getAccountsAggregate(
        {
          league: input.league,
          sponsored: input.sponsored,
          brand: input.brand,
          contentSeries: input.contentSeries,
        },
        input.sortBy,
        input.limit
      );
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

async function handleRemote(
  messages: { role: string; content: string }[],
  chatMode: ChatMode,
): Promise<string> {
  const client = getAnthropicClient();
  const useOpus = needsOpus(messages);
  const model = useOpus ? "claude-opus-4-6" : "claude-sonnet-4-6";
  // Opus is reached for visual/presentation requests; allow a much larger
  // output window so multi-slide decks (10+ slides of HTML) don't get
  // truncated mid-generation.
  const maxTokens = useOpus ? 32000 : 4096;

  const tools = chatMode === "usmajors" ? TOOLS_USMAJORS : TOOLS_GLOBAL;
  const baseSystemPrompt =
    chatMode === "usmajors" ? SYSTEM_PROMPT_USMAJORS : SYSTEM_PROMPT_GLOBAL;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const langHint = lastUser ? languageDirective(lastUser.content) : "";
  const systemPrompt = langHint
    ? `${langHint}\n\n${baseSystemPrompt}`
    : baseSystemPrompt;

  const sdkMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

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
  // Accumulates text across continuation rounds. When a long presentation
  // hits the output cap (stop_reason === "max_tokens"), the deck is split
  // across several responses and concatenated here.
  let accumulatedText = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Use streaming under the hood so the SDK doesn't refuse high
    // max_tokens (needed for long presentations) with the "Streaming
    // is required for operations that may take longer than 10 minutes"
    // error. finalMessage() collects the stream and returns the same
    // Message object create() would have returned.
    const response = await client.messages
      .stream({
        model,
        max_tokens: maxTokens,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        messages: currentMessages,
      })
      .finalMessage();

    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (response.stop_reason === "end_turn") {
      return accumulatedText + responseText;
    }

    if (response.stop_reason === "max_tokens") {
      // Output cap reached mid-generation (typically a long multi-slide
      // deck). Keep the partial assistant turn, ask the model to resume,
      // and accumulate. Concatenating WITHOUT a separator preserves HTML
      // continuity across the seam so closing tags / navigation survive.
      accumulatedText += responseText;
      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: responseText },
        { role: "user", content: "continue" },
      ];
      continue;
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: JSON.stringify(executeTool(block.name, block.input, chatMode)),
      }));

      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];

      continue;
    }

    return accumulatedText + responseText || "No response generated.";
  }

  // Ran out of iterations. If a very long deck needed more continuation
  // rounds than allowed, return what was assembled rather than a misleading
  // "too many data lookups" message.
  return accumulatedText || "The query required too many data lookups. Please try a simpler question.";
}

// --- POST handler ---

export async function POST(request: Request) {
  const { messages, mode } = await request.json();
  const chatMode = resolveMode(mode);

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
      ? await handleRemote(messages, chatMode)
      : await handleLocal(messages, chatMode);

    return Response.json({ response });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { response: `Error: ${message}` },
      { status: 500 }
    );
  }
}
