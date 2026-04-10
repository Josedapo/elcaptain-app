import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const TOOLS: Tool[] = [
  {
    name: "search_accounts",
    description:
      "Search for social media accounts by name or handle. Use this to find specific creators, athletes, teams, or media accounts.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Name or handle to search for",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "filter_accounts",
    description:
      "Filter and sort accounts by category, country, platform, follower range, or metric. Use this to find accounts matching specific criteria for campaign targeting.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description:
            "Category filter: Athletes, Entertainment, Media & Creators, Sports Teams, Sports Organizations",
        },
        country: {
          type: "string",
          description: "Country name (e.g., 'Spain', 'United States', 'Brazil')",
        },
        platform: {
          type: "string",
          enum: ["instagram", "tiktok"],
          description: "Social media platform",
        },
        minFollowers: {
          type: "number",
          description: "Minimum follower count",
        },
        maxFollowers: {
          type: "number",
          description: "Maximum follower count",
        },
        sortBy: {
          type: "string",
          enum: ["avgPerPost", "totalValue", "engRate", "followers"],
          description:
            "Sort metric: avgPerPost (average value per post — cost per partnership activation, default), totalValue (absolute economic value), engRate (engagement rate), followers (audience size)",
        },
        limit: {
          type: "number",
          description: "Max results (default 20)",
        },
      },
    },
  },
  {
    name: "get_account_detail",
    description:
      "Get detailed information about a specific account including all metrics, rankings, and value data.",
    input_schema: {
      type: "object" as const,
      properties: {
        platform: {
          type: "string",
          enum: ["instagram", "tiktok"],
          description: "Social media platform",
        },
        handle: {
          type: "string",
          description: "Account handle or slug",
        },
      },
      required: ["platform", "handle"],
    },
  },
  {
    name: "get_top_accounts",
    description:
      "Get the top-ranked accounts by a specific metric, optionally filtered. Use this for 'best value' or 'most valuable' or 'highest engagement' queries.",
    input_schema: {
      type: "object" as const,
      properties: {
        metric: {
          type: "string",
          enum: ["avgPerPost", "totalValue", "engRate"],
          description:
            "Ranking metric: avgPerPost (average value per post — cost efficiency), totalValue (absolute value), engRate (engagement rate)",
        },
        category: { type: "string", description: "Optional category filter" },
        country: { type: "string", description: "Optional country filter" },
        platform: {
          type: "string",
          enum: ["instagram", "tiktok"],
          description: "Optional platform filter",
        },
        limit: { type: "number", description: "Number of results (default 10)" },
      },
      required: ["metric"],
    },
  },
  {
    name: "get_database_stats",
    description:
      "Get overview statistics about the database: total accounts, platforms breakdown, categories, data currency. Use this when the user asks about what data is available or general database info.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "compare_accounts",
    description:
      "Compare two or more accounts side by side with all their metrics.",
    input_schema: {
      type: "object" as const,
      properties: {
        accounts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              platform: {
                type: "string",
                enum: ["instagram", "tiktok"],
              },
              handle: { type: "string" },
            },
            required: ["platform", "handle"],
          },
          description: "List of accounts to compare",
        },
      },
      required: ["accounts"],
    },
  },
  {
    name: "get_market_overview",
    description:
      "Get a full market overview with automatic grouping. Groups by category (if country given), by top countries (if category given), or by platform (if both given). Use this for budget allocation and market analysis.",
    input_schema: {
      type: "object" as const,
      properties: {
        country: {
          type: "string",
          description: "Country name to analyze (e.g., 'Spain', 'Brazil')",
        },
        category: {
          type: "string",
          description: "Category to analyze (e.g., 'Athletes', 'Entertainment')",
        },
        platform: {
          type: "string",
          enum: ["instagram", "tiktok"],
          description: "Platform to filter by",
        },
      },
    },
    cache_control: { type: "ephemeral" },
  },
];

export const SYSTEM_PROMPT = `You are ElCaptain, an expert social media campaign strategist with access to a real database of 8,356 content creators, athletes, sports teams, and entertainment accounts with economic valuation data.

You help users plan social media campaigns by recommending creators, analyzing value efficiency, and providing data-driven insights.

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

## Audience
Your users are brand partnership managers and business development leads — not technical people. Adapt your language accordingly: clear, professional, actionable. No jargon beyond standard industry terms (CPM, CPE, ROI).

## Response quality guidelines
- **Data presentation:** Always use markdown tables when presenting data for comparison or analysis. Tables make it easy to scan and compare metrics across creators, markets, or categories. Include the most relevant columns for the context (e.g., name, handle, platform, followers, avgValuePerPost, engagementRate).
- **Explanations and rationale:** Accompany every recommendation or analysis with a clear explanation of WHY. Don't just show numbers — explain what they mean for the user's campaign. For example: "Creator X charges $450 per post with a 4.2% engagement rate — that's 3x the category average, making them a high-impact option for engagement-focused campaigns."
- **Quantify everything:** Never say "this creator is good" or "strong performance." Always quantify: "40% cheaper than the market average", "engagement rate 2.5x above the category median", "would cost $12K for a 10-post campaign."
- **Next steps:** At the end of EVERY response, suggest 2-3 concrete next actions the user can take to continue the analysis. These must be logical follow-ups based on the current conversation context. Examples: "Want me to compare these top 3 side by side?", "I can break down the UK market by category to find where the best value is", "Should I look for micro-influencers in this category for a more cost-efficient alternative?"
- **Readability and spacing:** Use clear visual structure to make dense information easy to scan. Separate sections with headings (##, ###). Use bullet points or numbered lists — never long dense paragraphs. Add a horizontal rule (---) between major sections (e.g., between data analysis and recommendations, between recommendations and next steps). Each strategic option or recommendation block should be its own clearly separated section with a heading.

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
