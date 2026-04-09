import fs from "fs";
import path from "path";

export interface Account {
  handle: string;
  platform: "instagram" | "tiktok";
  name: string;
  followers: number;
  posts: number;
  valuePerFan: number;
  totalValue: number;
  impressions: number;
  engagement: number;
  engRate: number;
  category: string;
  country: string | null;
  countryCode: string | null;
  rank: { vpf: number; totalValue: number };
  slug: string;
}

interface AccountsData {
  meta: {
    lastUpdated: string;
    dataMonth: string;
    totalAccounts: number;
    platforms: { instagram: number; tiktok: number };
  };
  accounts: Account[];
}

let cached: AccountsData | null = null;
let exchangeRate: number | null = null;

function loadData(): AccountsData {
  if (cached) return cached;
  const raw = fs.readFileSync(
    path.join(process.cwd(), "data", "accounts.json"),
    "utf-8"
  );
  cached = JSON.parse(raw);
  return cached!;
}

function getExchangeRate(): number {
  if (exchangeRate) return exchangeRate;
  const raw = fs.readFileSync(
    path.join(process.cwd(), "data", "exchange-rate.json"),
    "utf-8"
  );
  exchangeRate = JSON.parse(raw).rate;
  return exchangeRate!;
}

function toUsd(eurValue: number): number {
  return eurValue * getExchangeRate();
}

function formatAccount(a: Account) {
  const totalUsd = Math.round(toUsd(a.totalValue));
  return {
    name: a.name,
    handle: a.handle,
    platform: a.platform,
    followers: a.followers,
    category: mapCategory(a.category),
    country: a.country || "Global",
    totalValue_usd: totalUsd,
    avgValuePerPost_usd: a.posts > 0 ? Math.round(totalUsd / a.posts) : 0,
    engagementRate_pct: +(a.engRate * 100).toFixed(2),
    impressions: a.impressions,
    engagement: a.engagement,
    posts: a.posts,
    rank_totalValue: a.rank.totalValue,
  };
}

function sortByAvgPerPost(a: Account, b: Account): number {
  const aVal = a.posts > 0 ? a.totalValue / a.posts : 0;
  const bVal = b.posts > 0 ? b.totalValue / b.posts : 0;
  return bVal - aVal;
}

// Category mapping (same as VPF)
const CATEGORY_MAP: Record<string, string> = {
  Athlete: "Athletes",
  Musician: "Entertainment",
  Actor: "Entertainment",
  Celebrity: "Entertainment",
  Entertainment: "Entertainment",
  Media: "Media & Creators",
  "Content Creator": "Media & Creators",
  "Sport Team": "Sports Teams",
  "Sport Organization": "Sports Organizations",
  "Sport League": "Sports Organizations",
};

function mapCategory(raw: string): string {
  return CATEGORY_MAP[raw] || raw;
}

// Tool implementations

export function searchAccounts(query: string, limit = 10) {
  const data = loadData();
  const q = query.toLowerCase();
  const results = data.accounts
    .filter(
      (a) =>
        a.name.toLowerCase().includes(q) || a.handle.toLowerCase().includes(q)
    )
    .slice(0, limit);
  return results.map(formatAccount);
}

export function filterAccounts(filters: {
  category?: string;
  country?: string;
  platform?: string;
  minFollowers?: number;
  maxFollowers?: number;
  sortBy?: "avgPerPost" | "totalValue" | "engRate" | "followers";
  limit?: number;
}) {
  const data = loadData();
  let results = data.accounts;

  if (filters.category) {
    const cat = filters.category.toLowerCase();
    results = results.filter(
      (a) =>
        mapCategory(a.category).toLowerCase().includes(cat) ||
        a.category.toLowerCase().includes(cat)
    );
  }
  if (filters.country) {
    const c = filters.country.toLowerCase();
    results = results.filter(
      (a) => (a.country || "Global").toLowerCase().includes(c)
    );
  }
  if (filters.platform) {
    results = results.filter((a) => a.platform === filters.platform);
  }
  if (filters.minFollowers) {
    results = results.filter((a) => a.followers >= filters.minFollowers!);
  }
  if (filters.maxFollowers) {
    results = results.filter((a) => a.followers <= filters.maxFollowers!);
  }

  const sortBy = filters.sortBy || "avgPerPost";
  results.sort((a, b) => {
    if (sortBy === "avgPerPost") return sortByAvgPerPost(a, b);
    if (sortBy === "totalValue") return b.totalValue - a.totalValue;
    if (sortBy === "engRate") return b.engRate - a.engRate;
    return b.followers - a.followers;
  });

  return results.slice(0, filters.limit || 20).map(formatAccount);
}

export function getAccountDetail(platform: string, handle: string) {
  const data = loadData();
  const account = data.accounts.find(
    (a) =>
      a.platform === platform &&
      (a.handle.toLowerCase() === handle.toLowerCase() ||
        a.slug.toLowerCase() === handle.toLowerCase())
  );
  if (!account) return null;
  return formatAccount(account);
}

export function getTopAccounts(
  metric: "avgPerPost" | "totalValue" | "engRate",
  filters?: { category?: string; country?: string; platform?: string },
  limit = 10
) {
  const data = loadData();
  let results = data.accounts;

  if (filters?.category) {
    const cat = filters.category.toLowerCase();
    results = results.filter(
      (a) =>
        mapCategory(a.category).toLowerCase().includes(cat) ||
        a.category.toLowerCase().includes(cat)
    );
  }
  if (filters?.country) {
    const c = filters.country.toLowerCase();
    results = results.filter(
      (a) => (a.country || "Global").toLowerCase().includes(c)
    );
  }
  if (filters?.platform) {
    results = results.filter((a) => a.platform === filters.platform);
  }

  results.sort((a, b) => {
    if (metric === "avgPerPost") return sortByAvgPerPost(a, b);
    if (metric === "totalValue") return b.totalValue - a.totalValue;
    return b.engRate - a.engRate;
  });

  return results.slice(0, limit).map(formatAccount);
}

export function getStats() {
  const data = loadData();
  const categories = new Set(data.accounts.map((a) => mapCategory(a.category)));
  const countries = new Set(
    data.accounts.map((a) => a.country || "Global")
  );

  return {
    totalAccounts: data.meta.totalAccounts,
    platforms: data.meta.platforms,
    dataMonth: data.meta.dataMonth,
    lastUpdated: data.meta.lastUpdated,
    categories: Array.from(categories).sort(),
    countriesCount: countries.size,
  };
}

export function compareAccounts(
  accounts: { platform: string; handle: string }[]
) {
  return accounts
    .map((a) => getAccountDetail(a.platform, a.handle))
    .filter(Boolean);
}

export function getMarketOverview(filters: {
  country?: string;
  category?: string;
  platform?: string;
}) {
  const data = loadData();
  let pool = data.accounts;

  if (filters.country) {
    const c = filters.country.toLowerCase();
    pool = pool.filter((a) => (a.country || "Global").toLowerCase().includes(c));
  }
  if (filters.category) {
    const cat = filters.category.toLowerCase();
    pool = pool.filter(
      (a) =>
        mapCategory(a.category).toLowerCase().includes(cat) ||
        a.category.toLowerCase().includes(cat)
    );
  }
  if (filters.platform) {
    pool = pool.filter((a) => a.platform === filters.platform);
  }

  if (pool.length === 0) {
    return { error: "No accounts found for these filters", filters };
  }

  const platforms = {
    instagram: pool.filter((a) => a.platform === "instagram").length,
    tiktok: pool.filter((a) => a.platform === "tiktok").length,
  };

  function buildGroup(groupAccounts: Account[]) {
    const sorted = [...groupAccounts].sort(sortByAvgPerPost);
    return {
      totalAccounts: groupAccounts.length,
      top3_byAvgPerPost: sorted.slice(0, 3).map(formatAccount),
      avgEngRate: +(
        (groupAccounts.reduce((s, a) => s + a.engRate, 0) /
          groupAccounts.length) *
        100
      ).toFixed(2),
      totalMarketValue_usd: groupAccounts.reduce(
        (s, a) => s + Math.round(toUsd(a.totalValue)),
        0
      ),
    };
  }

  let groupBy: string;
  let groups: { name: string; [key: string]: unknown }[];

  if (filters.category && filters.country) {
    groupBy = "platform";
    groups = [...new Set(pool.map((a) => a.platform))].sort().map((g) => ({
      name: g,
      ...buildGroup(pool.filter((a) => a.platform === g)),
    }));
  } else if (filters.category) {
    groupBy = "country";
    const countries = [...new Set(pool.map((a) => a.country || "Global"))];
    groups = countries
      .map((c) => ({
        name: c,
        ...buildGroup(pool.filter((a) => (a.country || "Global") === c)),
      }))
      .sort((a, b) => (b.totalAccounts as number) - (a.totalAccounts as number))
      .slice(0, 10);
  } else {
    groupBy = "category";
    const cats = [...new Set(pool.map((a) => mapCategory(a.category)))].sort();
    groups = cats.map((cat) => ({
      name: cat,
      ...buildGroup(pool.filter((a) => mapCategory(a.category) === cat)),
    }));
  }

  return {
    filters: {
      country: filters.country || "all",
      category: filters.category || "all",
      platform: filters.platform || "all",
    },
    totalAccounts: pool.length,
    platforms,
    groupBy,
    groups,
  };
}
