import fs from "fs";
import path from "path";
import { getUsMajorsHandleMap } from "./usMajors";

export interface Post {
  id: string;
  handle: string;
  league: "NFL" | "NBA" | "MLB" | "MLS";
  publishedAt: string;
  totalValue: number;
  impressions: number;
  engagement: number;
  engRate: number;
  country: string | null;
  countryCode: string | null;
  contentSeries: string | null;
  brand: string | null;
  sponsored: boolean;
}

interface PostsData {
  meta: {
    lastUpdated: string;
    dateRange: { start: string; end: string };
    totalPosts: number;
    platform: string;
    leagues: Record<string, number>;
    sponsoredCount: number;
    unsponsoredCount: number;
    currency: string;
    note: string;
  };
  posts: Post[];
}

let cached: PostsData | null = null;
let exchangeRate: number | null = null;

function load(): PostsData {
  if (cached) return cached;
  const raw = fs.readFileSync(
    path.join(process.cwd(), "data", "posts.json"),
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

function toUsd(eur: number): number {
  return eur * getExchangeRate();
}

function formatPost(p: Post) {
  const handleMap = getUsMajorsHandleMap();
  const meta = handleMap.get(p.handle.toLowerCase());
  return {
    id: p.id,
    handle: p.handle,
    accountName: meta?.accountName ?? p.handle,
    league: p.league,
    url: `https://www.instagram.com/p/${p.id}/`,
    totalValue_usd: Math.round(toUsd(p.totalValue)),
    impressions: p.impressions,
    engagement: p.engagement,
    engagementRate_pct: +(p.engRate * 100).toFixed(2),
    country: p.country ?? "Global",
    contentSeries: p.contentSeries,
    brand: p.brand,
    sponsored: p.sponsored,
  };
}

interface PostFilters {
  league?: "NFL" | "NBA" | "MLB" | "MLS";
  handle?: string;
  sponsored?: boolean;
  brand?: string;
  contentSeries?: string;
  country?: string;
  minImpressions?: number;
  minEngagement?: number;
}

function applyFilters(posts: Post[], f: PostFilters): Post[] {
  let r = posts;
  if (f.league) r = r.filter((p) => p.league === f.league);
  if (f.handle) {
    const h = f.handle.toLowerCase();
    r = r.filter((p) => p.handle.toLowerCase() === h);
  }
  if (f.sponsored !== undefined) r = r.filter((p) => p.sponsored === f.sponsored);
  if (f.brand) {
    const b = f.brand.toLowerCase();
    r = r.filter((p) => p.brand && p.brand.toLowerCase().includes(b));
  }
  if (f.contentSeries) {
    const cs = f.contentSeries.toLowerCase();
    r = r.filter(
      (p) => p.contentSeries && p.contentSeries.toLowerCase().includes(cs)
    );
  }
  if (f.country) {
    const c = f.country.toLowerCase();
    r = r.filter((p) => (p.country || "").toLowerCase().includes(c));
  }
  if (f.minImpressions) r = r.filter((p) => p.impressions >= f.minImpressions!);
  if (f.minEngagement) r = r.filter((p) => p.engagement >= f.minEngagement!);
  return r;
}

export function searchPosts(query: string, limit = 20) {
  const data = load();
  const q = query.toLowerCase();
  const results = data.posts
    .filter(
      (p) =>
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.contentSeries && p.contentSeries.toLowerCase().includes(q)) ||
        p.handle.toLowerCase().includes(q)
    )
    .slice(0, limit);
  return results.map(formatPost);
}

export function getTopPosts(
  metric: "engRate" | "impressions" | "engagement" | "totalValue",
  filters: PostFilters = {},
  limit = 10
) {
  const data = load();
  let pool = applyFilters(data.posts, filters);

  pool = [...pool].sort((a, b) => {
    if (metric === "engRate") return b.engRate - a.engRate;
    if (metric === "impressions") return b.impressions - a.impressions;
    if (metric === "engagement") return b.engagement - a.engagement;
    return b.totalValue - a.totalValue;
  });

  return {
    metric,
    filters,
    totalMatching: pool.length,
    results: pool.slice(0, limit).map(formatPost),
  };
}

export function getPostsByAccount(handle: string, limit = 50) {
  const data = load();
  const h = handle.toLowerCase();
  const handleMap = getUsMajorsHandleMap();
  const meta = handleMap.get(h);
  const posts = data.posts.filter((p) => p.handle.toLowerCase() === h);

  if (posts.length === 0) {
    return { error: `No posts found for handle '${handle}' in NFL/NBA/MLB/MLS dataset` };
  }

  const sorted = [...posts].sort((a, b) => b.engRate - a.engRate);
  const sponsoredCount = posts.filter((p) => p.sponsored).length;
  return {
    handle: h,
    accountName: meta?.accountName ?? h,
    league: meta?.league,
    totalPosts: posts.length,
    sponsoredCount,
    unsponsoredCount: posts.length - sponsoredCount,
    avgEngagementRate_pct: +(
      (posts.reduce((s, p) => s + p.engRate, 0) / posts.length) *
      100
    ).toFixed(2),
    topPostsByEngagement: sorted.slice(0, limit).map(formatPost),
  };
}

export function getSponsorshipOpportunities(
  filters: PostFilters = {},
  limit = 20
) {
  const data = load();
  const filtersWithUnsponsored = { ...filters, sponsored: false };
  const pool = applyFilters(data.posts, filtersWithUnsponsored);

  const sorted = [...pool].sort((a, b) => b.engRate - a.engRate);

  return {
    filters: filtersWithUnsponsored,
    totalOpportunities: pool.length,
    note: "Posts with no current brand activation, ranked by engagement rate. These are candidates for sponsorship.",
    topOpportunities: sorted.slice(0, limit).map(formatPost),
  };
}

export function getContentSeriesStats(filters: PostFilters = {}) {
  const data = load();
  const pool = applyFilters(data.posts, filters).filter(
    (p) => p.contentSeries !== null
  );

  if (pool.length === 0) {
    return { error: "No posts with content series for these filters", filters };
  }

  const seriesMap = new Map<string, Post[]>();
  for (const p of pool) {
    const key = p.contentSeries!;
    if (!seriesMap.has(key)) seriesMap.set(key, []);
    seriesMap.get(key)!.push(p);
  }

  const series = Array.from(seriesMap.entries())
    .map(([name, posts]) => {
      const sponsored = posts.filter((p) => p.sponsored).length;
      const avgEng =
        posts.reduce((s, p) => s + p.engRate, 0) / posts.length;
      const totalImpressions = posts.reduce((s, p) => s + p.impressions, 0);
      const totalEngagement = posts.reduce((s, p) => s + p.engagement, 0);
      return {
        name,
        totalPosts: posts.length,
        sponsoredCount: sponsored,
        unsponsoredCount: posts.length - sponsored,
        avgEngagementRate_pct: +(avgEng * 100).toFixed(2),
        totalImpressions,
        totalEngagement,
        sponsorshipOpportunityScore: +(
          (1 - sponsored / posts.length) * avgEng * 100
        ).toFixed(2),
      };
    })
    .sort(
      (a, b) =>
        b.sponsorshipOpportunityScore - a.sponsorshipOpportunityScore
    );

  return {
    filters,
    totalSeries: series.length,
    series,
  };
}

export function getBrandStats(brandQuery: string) {
  const data = load();
  const q = brandQuery.toLowerCase();
  const posts = data.posts.filter(
    (p) => p.brand && p.brand.toLowerCase().includes(q)
  );

  if (posts.length === 0) {
    return { error: `No posts found for brand matching '${brandQuery}'` };
  }

  const brandMap = new Map<string, Post[]>();
  for (const p of posts) {
    if (!brandMap.has(p.brand!)) brandMap.set(p.brand!, []);
    brandMap.get(p.brand!)!.push(p);
  }

  const byBrand = Array.from(brandMap.entries())
    .map(([brand, ps]) => {
      const handles = new Set(ps.map((p) => p.handle));
      const leagues = new Set(ps.map((p) => p.league));
      const avgEng = ps.reduce((s, p) => s + p.engRate, 0) / ps.length;
      return {
        brand,
        totalPosts: ps.length,
        distinctAccounts: handles.size,
        leagues: Array.from(leagues),
        avgEngagementRate_pct: +(avgEng * 100).toFixed(2),
        totalImpressions: ps.reduce((s, p) => s + p.impressions, 0),
        totalEngagement: ps.reduce((s, p) => s + p.engagement, 0),
        totalValue_usd: Math.round(
          ps.reduce((s, p) => s + toUsd(p.totalValue), 0)
        ),
      };
    })
    .sort((a, b) => b.totalPosts - a.totalPosts);

  return {
    query: brandQuery,
    brandsFound: byBrand.length,
    brands: byBrand,
  };
}

export function getLeagueStats(league?: "NFL" | "NBA" | "MLB" | "MLS") {
  const data = load();
  const filter = league ? (p: Post) => p.league === league : () => true;
  const pool = data.posts.filter(filter);

  if (pool.length === 0) {
    return { error: `No posts found for league ${league}` };
  }

  const sponsored = pool.filter((p) => p.sponsored);
  const brands = new Set(sponsored.map((p) => p.brand!));
  const handles = new Set(pool.map((p) => p.handle));
  const avgEng = pool.reduce((s, p) => s + p.engRate, 0) / pool.length;

  return {
    league: league ?? "ALL",
    totalPosts: pool.length,
    distinctAccounts: handles.size,
    sponsoredCount: sponsored.length,
    unsponsoredCount: pool.length - sponsored.length,
    sponsoredPct: +((sponsored.length / pool.length) * 100).toFixed(1),
    distinctBrands: brands.size,
    avgEngagementRate_pct: +(avgEng * 100).toFixed(2),
    totalImpressions: pool.reduce((s, p) => s + p.impressions, 0),
    totalEngagement: pool.reduce((s, p) => s + p.engagement, 0),
    totalValue_usd: Math.round(
      pool.reduce((s, p) => s + toUsd(p.totalValue), 0)
    ),
  };
}

export function getAccountsAggregate(
  filters: PostFilters = {},
  sortBy:
    | "totalValue"
    | "totalImpressions"
    | "totalEngagement"
    | "avgEngRate"
    | "totalPosts" = "totalValue",
  limit = 10
) {
  const data = load();
  const pool = applyFilters(data.posts, filters);

  if (pool.length === 0) {
    return { error: "No posts match these filters", filters };
  }

  const handleMap = getUsMajorsHandleMap();
  const byHandle = new Map<string, Post[]>();
  for (const p of pool) {
    if (!byHandle.has(p.handle)) byHandle.set(p.handle, []);
    byHandle.get(p.handle)!.push(p);
  }

  const accounts = Array.from(byHandle.entries()).map(([handle, ps]) => {
    const meta = handleMap.get(handle.toLowerCase());
    const sponsored = ps.filter((p) => p.sponsored).length;
    const totalImpressions = ps.reduce((s, p) => s + p.impressions, 0);
    const totalEngagement = ps.reduce((s, p) => s + p.engagement, 0);
    const totalValue = ps.reduce((s, p) => s + p.totalValue, 0);
    const avgEng = ps.reduce((s, p) => s + p.engRate, 0) / ps.length;
    return {
      handle,
      accountName: meta?.accountName ?? handle,
      league: meta?.league,
      totalPosts: ps.length,
      sponsoredCount: sponsored,
      unsponsoredCount: ps.length - sponsored,
      totalImpressions,
      totalEngagement,
      totalValue_usd: Math.round(toUsd(totalValue)),
      avgValuePerPost_usd: Math.round(toUsd(totalValue) / ps.length),
      avgEngagementRate_pct: +(avgEng * 100).toFixed(2),
    };
  });

  accounts.sort((a, b) => {
    if (sortBy === "totalImpressions") return b.totalImpressions - a.totalImpressions;
    if (sortBy === "totalEngagement") return b.totalEngagement - a.totalEngagement;
    if (sortBy === "avgEngRate")
      return b.avgEngagementRate_pct - a.avgEngagementRate_pct;
    if (sortBy === "totalPosts") return b.totalPosts - a.totalPosts;
    return b.totalValue_usd - a.totalValue_usd;
  });

  return {
    filters,
    sortBy,
    totalAccounts: accounts.length,
    totalPostsMatched: pool.length,
    accounts: accounts.slice(0, limit),
  };
}

export function getPostsStats() {
  const data = load();
  const series = new Set(
    data.posts.filter((p) => p.contentSeries).map((p) => p.contentSeries!)
  );
  const brands = new Set(
    data.posts.filter((p) => p.brand).map((p) => p.brand!)
  );
  return {
    coverage: "Post-level data covers NFL/NBA/MLB/MLS official team and league Instagram accounts.",
    totalPosts: data.meta.totalPosts,
    leagues: data.meta.leagues,
    sponsoredCount: data.meta.sponsoredCount,
    unsponsoredCount: data.meta.unsponsoredCount,
    distinctContentSeries: series.size,
    contentSeriesList: Array.from(series).sort(),
    distinctBrands: brands.size,
  };
}
