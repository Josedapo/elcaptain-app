import type { Tool } from "@anthropic-ai/sdk/resources/messages";

const ACCOUNT_TOOLS_GLOBAL: Tool[] = [
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

const POST_TOOLS: Tool[] = [
  {
    name: "get_top_posts",
    description:
      "Get the top-ranked individual posts by a chosen metric, with optional filters (league, sponsored, brand, content series). Use for 'best performing posts', 'highest engagement posts', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        metric: {
          type: "string",
          enum: ["engRate", "impressions", "engagement", "totalValue"],
          description:
            "Ranking metric: engRate (engagement rate), impressions (reach), engagement (interactions), totalValue (USD value)",
        },
        league: {
          type: "string",
          enum: ["NFL", "NBA", "MLB"],
          description: "Optional league filter",
        },
        sponsored: {
          type: "boolean",
          description:
            "Optional: true = only sponsored posts, false = only unsponsored posts (sponsorship candidates)",
        },
        brand: {
          type: "string",
          description: "Optional brand filter (matches partial string)",
        },
        contentSeries: {
          type: "string",
          description: "Optional content series filter (matches partial string)",
        },
        limit: { type: "number", description: "Max results (default 10, max 50)" },
      },
      required: ["metric"],
    },
  },
  {
    name: "get_posts_by_account",
    description:
      "Get all posts published by a specific account in the current dataset. Returns aggregated stats + top posts by engagement.",
    input_schema: {
      type: "object" as const,
      properties: {
        handle: {
          type: "string",
          description: "Account handle (e.g., 'lakers', 'okcthunder', 'nba')",
        },
        limit: { type: "number", description: "Max top posts returned (default 50)" },
      },
      required: ["handle"],
    },
  },
  {
    name: "get_sponsorship_opportunities",
    description:
      "Get posts that are NOT currently sponsored (no brand activation) ranked by engagement rate. These are candidates a brand could sponsor. Use when user asks about 'sponsorship opportunities', 'posts to sponsor', 'untapped content'.",
    input_schema: {
      type: "object" as const,
      properties: {
        league: {
          type: "string",
          enum: ["NFL", "NBA", "MLB"],
          description: "Optional league filter",
        },
        contentSeries: {
          type: "string",
          description: "Optional content series filter",
        },
        handle: {
          type: "string",
          description: "Optional handle filter",
        },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "get_content_series_stats",
    description:
      "Aggregate stats per content series (Match Full Time, Birthday, etc.): post count, sponsorship density, average engagement, and a sponsorship opportunity score. Use when user asks 'which content series perform best?' or 'which series are good sponsorship candidates?'.",
    input_schema: {
      type: "object" as const,
      properties: {
        league: {
          type: "string",
          enum: ["NFL", "NBA", "MLB"],
          description: "Optional league filter",
        },
        handle: {
          type: "string",
          description: "Optional handle filter",
        },
      },
    },
  },
  {
    name: "get_brand_stats",
    description:
      "Get aggregated activity stats for a brand or brand search: how many posts they've activated, across which accounts and leagues, average engagement, and total value.",
    input_schema: {
      type: "object" as const,
      properties: {
        brand: {
          type: "string",
          description: "Brand name or partial string (e.g., 'Nike', 'ESPN')",
        },
      },
      required: ["brand"],
    },
  },
  {
    name: "get_league_stats",
    description:
      "Get league-level aggregates: total posts, sponsorship density, distinct brands, average engagement, total value.",
    input_schema: {
      type: "object" as const,
      properties: {
        league: {
          type: "string",
          enum: ["NFL", "NBA", "MLB"],
          description: "Optional: omit for all leagues combined",
        },
      },
    },
  },
  {
    name: "get_posts_dataset_stats",
    description:
      "Get an overview of the posts dataset: date range, total posts, leagues, sponsored ratio, available content series, brand count. Use when user asks what post-level data is available.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_accounts_aggregate_from_posts",
    description:
      "Aggregate posts BY ACCOUNT and return one row per handle with totals (posts, impressions, engagement, value) and avg engagement rate. Use this whenever the user asks 'which accounts/teams drive X', 'top teams for Y', 'which accounts have most posts in this content series', etc. DO NOT use get_top_posts and then label the rows as accounts — use this tool instead so each row truly represents one account.",
    input_schema: {
      type: "object" as const,
      properties: {
        league: {
          type: "string",
          enum: ["NFL", "NBA", "MLB"],
          description: "Optional league filter",
        },
        sponsored: {
          type: "boolean",
          description: "Optional sponsored/unsponsored filter on the underlying posts",
        },
        brand: {
          type: "string",
          description: "Optional brand filter",
        },
        contentSeries: {
          type: "string",
          description: "Optional content series filter",
        },
        sortBy: {
          type: "string",
          enum: ["totalValue", "totalImpressions", "totalEngagement", "avgEngRate", "totalPosts"],
          description: "Account-level sort metric (default totalValue)",
        },
        limit: { type: "number", description: "Max accounts (default 10, max 50)" },
      },
    },
  },
];

export const TOOLS_GLOBAL: Tool[] = ACCOUNT_TOOLS_GLOBAL;

// US Majors mode: same account tools (auto-scoped server-side via mode) + post tools
export const TOOLS_USMAJORS: Tool[] = [...ACCOUNT_TOOLS_GLOBAL, ...POST_TOOLS];

// Backwards-compatible export (used by anything that hasn't migrated yet)
export const TOOLS = TOOLS_GLOBAL;

// Re-export prompts for backwards compatibility
export { SYSTEM_PROMPT_GLOBAL as SYSTEM_PROMPT } from "./prompts";
