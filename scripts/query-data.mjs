#!/usr/bin/env node

/**
 * Data query tool for ElCaptain.
 * Claude Code runs this script via Bash to query the database.
 *
 * Account commands (add --mode usmajors to scope to NFL/NBA/MLB/MLS):
 *   search <query> [--limit N] [--mode usmajors]
 *   top <avgPerPost|totalValue|engRate> [--category X] [--country X] [--platform X] [--limit N] [--mode usmajors]
 *   detail <instagram|tiktok> <handle> [--mode usmajors]
 *   filter [--category X] [--country X] [--platform X] [--minFollowers N] [--maxFollowers N] [--sortBy X] [--limit N] [--mode usmajors]
 *   compare <platform/handle> <platform/handle> [--mode usmajors]
 *   market [country] [--category X] [--platform X] [--mode usmajors]
 *   stats [--mode usmajors]
 *
 * Post commands (usmajors mode only):
 *   posts-top <engRate|impressions|engagement|totalValue> [--league X] [--sponsored true|false] [--brand X] [--contentSeries X] [--limit N]
 *   posts-search <query> [--limit N]
 *   posts-by-account <handle> [--limit N]
 *   posts-opportunities [--league X] [--contentSeries X] [--handle X] [--limit N]
 *   posts-series-stats [--league X] [--handle X]
 *   posts-brand <brand-query>
 *   posts-league-stats [--league X]
 *   posts-stats
 */

import fs from "fs";
import path from "path";

const dataPath = path.join(process.cwd(), "data", "accounts.json");
const ratePath = path.join(process.cwd(), "data", "exchange-rate.json");
const postsPath = path.join(process.cwd(), "data", "posts.json");
const usMajorsPath = path.join(process.cwd(), "data", "us-majors-handles.json");

const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
const rate = JSON.parse(fs.readFileSync(ratePath, "utf-8")).rate;
const accounts = raw.accounts;
const meta = raw.meta;

let postsData = null;
let usMajorsData = null;
let usMajorsHandleSet = null;
let usMajorsHandleMap = null;

function loadPosts() {
  if (!postsData) postsData = JSON.parse(fs.readFileSync(postsPath, "utf-8"));
  return postsData;
}
function loadUsMajors() {
  if (!usMajorsData) {
    usMajorsData = JSON.parse(fs.readFileSync(usMajorsPath, "utf-8"));
    usMajorsHandleSet = new Set(usMajorsData.handles.map((h) => h.handle.toLowerCase()));
    usMajorsHandleMap = new Map(usMajorsData.handles.map((h) => [h.handle.toLowerCase(), h]));
  }
  return usMajorsData;
}

const CATEGORY_MAP = {
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

function mapCat(c) { return CATEGORY_MAP[c] || c; }
function usd(eur) { return Math.round(eur * rate); }

function fmt(a) {
  const totalUsd = usd(a.totalValue);
  return {
    name: a.name,
    handle: a.handle,
    platform: a.platform,
    followers: a.followers,
    category: mapCat(a.category),
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

function fmtPost(p) {
  loadUsMajors();
  const m = usMajorsHandleMap.get(p.handle.toLowerCase());
  return {
    id: p.id,
    handle: p.handle,
    accountName: m ? m.accountName : p.handle,
    league: p.league,
    url: `https://www.instagram.com/p/${p.id}/`,
    totalValue_usd: usd(p.totalValue),
    impressions: p.impressions,
    engagement: p.engagement,
    engagementRate_pct: +(p.engRate * 100).toFixed(2),
    country: p.country || "Global",
    contentSeries: p.contentSeries,
    brand: p.brand,
    sponsored: p.sponsored,
  };
}

function matchCat(a, cat) {
  const c = cat.toLowerCase();
  return mapCat(a.category).toLowerCase().includes(c) || a.category.toLowerCase().includes(c);
}

function matchCountry(a, country) {
  return (a.country || "Global").toLowerCase().includes(country.toLowerCase());
}

function parseArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

function scopedAccounts(modeFlag) {
  if (modeFlag === "usmajors") {
    loadUsMajors();
    return accounts.filter(
      (a) => a.platform === "instagram" && usMajorsHandleSet.has(a.handle.toLowerCase())
    );
  }
  return accounts;
}

function applyPostFilters(posts, flags) {
  let r = posts;
  if (flags.league) r = r.filter((p) => p.league === flags.league);
  if (flags.sponsored !== undefined) {
    const want = flags.sponsored === "true";
    r = r.filter((p) => p.sponsored === want);
  }
  if (flags.brand) {
    const b = flags.brand.toLowerCase();
    r = r.filter((p) => p.brand && p.brand.toLowerCase().includes(b));
  }
  if (flags.contentSeries) {
    const cs = flags.contentSeries.toLowerCase();
    r = r.filter((p) => p.contentSeries && p.contentSeries.toLowerCase().includes(cs));
  }
  if (flags.handle) {
    const h = flags.handle.toLowerCase();
    r = r.filter((p) => p.handle.toLowerCase() === h);
  }
  return r;
}

const [cmd, ...rest] = process.argv.slice(2);
const globalFlags = parseArgs(rest);
const modeFlag = globalFlags.mode || process.env.ELCAPTAIN_CHAT_MODE || "global";

switch (cmd) {
  case "search": {
    const q = rest.filter((r, i) => !r.startsWith("--") && !(i > 0 && rest[i-1].startsWith("--"))).join(" ").toLowerCase();
    const limit = parseInt(globalFlags.limit || "10");
    const pool = scopedAccounts(modeFlag);
    const results = pool
      .filter((a) => a.name.toLowerCase().includes(q) || a.handle.toLowerCase().includes(q))
      .slice(0, limit).map(fmt);
    console.log(JSON.stringify(results, null, 2));
    break;
  }

  case "top": {
    const metric = rest[0] || "vpf";
    let filtered = scopedAccounts(modeFlag);
    if (globalFlags.category) filtered = filtered.filter((a) => matchCat(a, globalFlags.category));
    if (globalFlags.country) filtered = filtered.filter((a) => matchCountry(a, globalFlags.country));
    if (globalFlags.platform) filtered = filtered.filter((a) => a.platform === globalFlags.platform);
    const limit = parseInt(globalFlags.limit || "10");
    filtered = [...filtered].sort((a, b) => {
      if (metric === "avgPerPost") return (b.posts > 0 ? b.totalValue/b.posts : 0) - (a.posts > 0 ? a.totalValue/a.posts : 0);
      if (metric === "totalValue") return b.totalValue - a.totalValue;
      if (metric === "engRate") return b.engRate - a.engRate;
      return b.followers - a.followers;
    });
    console.log(JSON.stringify(filtered.slice(0, limit).map(fmt), null, 2));
    break;
  }

  case "detail": {
    const platform = rest[0];
    const handle = rest[1];
    const pool = scopedAccounts(modeFlag);
    const a = pool.find(
      (x) => x.platform === platform && (x.handle.toLowerCase() === handle.toLowerCase() || x.slug.toLowerCase() === handle.toLowerCase())
    );
    console.log(a ? JSON.stringify(fmt(a), null, 2) : JSON.stringify({ error: "Account not found" }));
    break;
  }

  case "filter": {
    let filtered = scopedAccounts(modeFlag);
    if (globalFlags.category) filtered = filtered.filter((a) => matchCat(a, globalFlags.category));
    if (globalFlags.country) filtered = filtered.filter((a) => matchCountry(a, globalFlags.country));
    if (globalFlags.platform) filtered = filtered.filter((a) => a.platform === globalFlags.platform);
    if (globalFlags.minFollowers) filtered = filtered.filter((a) => a.followers >= parseInt(globalFlags.minFollowers));
    if (globalFlags.maxFollowers) filtered = filtered.filter((a) => a.followers <= parseInt(globalFlags.maxFollowers));
    const sortBy = globalFlags.sortBy || "avgPerPost";
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === "avgPerPost") return (b.posts > 0 ? b.totalValue/b.posts : 0) - (a.posts > 0 ? a.totalValue/a.posts : 0);
      if (sortBy === "totalValue") return b.totalValue - a.totalValue;
      if (sortBy === "engRate") return b.engRate - a.engRate;
      return b.followers - a.followers;
    });
    const limit = parseInt(globalFlags.limit || "20");
    console.log(JSON.stringify(filtered.slice(0, limit).map(fmt), null, 2));
    break;
  }

  case "compare": {
    const pool = scopedAccounts(modeFlag);
    const pairs = rest.filter((r) => !r.startsWith("--")).map((r) => {
      const [p, h] = r.split("/");
      return pool.find(
        (a) => a.platform === p && (a.handle.toLowerCase() === h.toLowerCase() || a.slug.toLowerCase() === h.toLowerCase())
      );
    });
    console.log(JSON.stringify(pairs.filter(Boolean).map(fmt), null, 2));
    break;
  }

  case "market": {
    const flagValues = new Set(Object.values(globalFlags));
    const positionalArgs = rest.filter((r) => !r.startsWith("--") && !flagValues.has(r)).join(" ");
    const mCountry = globalFlags.country || positionalArgs || null;
    const mCategory = globalFlags.category || null;
    const mPlatform = globalFlags.platform || null;

    let pool = scopedAccounts(modeFlag);
    if (mCountry) pool = pool.filter((a) => matchCountry(a, mCountry));
    if (mCategory) pool = pool.filter((a) => matchCat(a, mCategory));
    if (mPlatform) pool = pool.filter((a) => a.platform === mPlatform);

    if (pool.length === 0) { console.log(JSON.stringify({ error: "No accounts found for these filters", filters: { country: mCountry, category: mCategory, platform: mPlatform } })); break; }

    const platforms = { instagram: pool.filter((a) => a.platform === "instagram").length, tiktok: pool.filter((a) => a.platform === "tiktok").length };

    let groupBy, groups;
    if (mCategory && mCountry) {
      groupBy = "platform";
      groups = [...new Set(pool.map((a) => a.platform))].sort().map((g) => {
        const gA = pool.filter((a) => a.platform === g);
        gA.sort((a, b) => (b.posts > 0 ? b.totalValue/b.posts : 0) - (a.posts > 0 ? a.totalValue/a.posts : 0));
        return { name: g, totalAccounts: gA.length, top3_byAvgPerPost: gA.slice(0, 3).map(fmt), avgEngRate: +(gA.reduce((s, a) => s + a.engRate, 0) / gA.length * 100).toFixed(2), totalMarketValue_usd: gA.reduce((s, a) => s + usd(a.totalValue), 0) };
      });
    } else if (mCategory) {
      groupBy = "country";
      const countries = [...new Set(pool.map((a) => a.country || "Global"))];
      groups = countries.map((c) => {
        const gA = pool.filter((a) => (a.country || "Global") === c);
        gA.sort((a, b) => (b.posts > 0 ? b.totalValue/b.posts : 0) - (a.posts > 0 ? a.totalValue/a.posts : 0));
        return { name: c, totalAccounts: gA.length, top3_byAvgPerPost: gA.slice(0, 3).map(fmt), avgEngRate: +(gA.reduce((s, a) => s + a.engRate, 0) / gA.length * 100).toFixed(2), totalMarketValue_usd: gA.reduce((s, a) => s + usd(a.totalValue), 0) };
      }).sort((a, b) => b.totalAccounts - a.totalAccounts).slice(0, 10);
    } else {
      groupBy = "category";
      const cats = [...new Set(pool.map((a) => mapCat(a.category)))].sort();
      groups = cats.map((cat) => {
        const gA = pool.filter((a) => mapCat(a.category) === cat);
        gA.sort((a, b) => (b.posts > 0 ? b.totalValue/b.posts : 0) - (a.posts > 0 ? a.totalValue/a.posts : 0));
        return { name: cat, totalAccounts: gA.length, top3_byAvgPerPost: gA.slice(0, 3).map(fmt), avgEngRate: +(gA.reduce((s, a) => s + a.engRate, 0) / gA.length * 100).toFixed(2), totalMarketValue_usd: gA.reduce((s, a) => s + usd(a.totalValue), 0) };
      });
    }

    console.log(JSON.stringify({
      filters: { country: mCountry || "all", category: mCategory || "all", platform: mPlatform || "all" },
      totalAccounts: pool.length, platforms, groupBy, groups,
    }, null, 2));
    break;
  }

  case "stats": {
    const pool = scopedAccounts(modeFlag);
    const categories = [...new Set(pool.map((a) => mapCat(a.category)))].sort();
    const countries = [...new Set(pool.map((a) => a.country || "Global"))].sort();
    if (modeFlag === "usmajors") {
      console.log(JSON.stringify({
        scope: "usmajors",
        totalAccounts: pool.length,
        platforms: { instagram: pool.length, tiktok: 0 },
        categories, countriesCount: countries.length,
        note: "Account-level data scoped to NFL/NBA/MLB/MLS official Instagram accounts.",
      }, null, 2));
    } else {
      console.log(JSON.stringify({
        totalAccounts: meta.totalAccounts, platforms: meta.platforms,
        categories, countriesCount: countries.length,
        topCountries: countries.map((c) => ({ country: c, count: accounts.filter((a) => (a.country || "Global") === c).length })).sort((a, b) => b.count - a.count).slice(0, 15),
      }, null, 2));
    }
    break;
  }

  // --- POST COMMANDS ---

  case "posts-top": {
    const metric = rest[0] || "engRate";
    const data = loadPosts();
    let pool = applyPostFilters(data.posts, globalFlags);
    pool = [...pool].sort((a, b) => {
      if (metric === "engRate") return b.engRate - a.engRate;
      if (metric === "impressions") return b.impressions - a.impressions;
      if (metric === "engagement") return b.engagement - a.engagement;
      return b.totalValue - a.totalValue;
    });
    const limit = parseInt(globalFlags.limit || "10");
    console.log(JSON.stringify({
      metric, filters: globalFlags, totalMatching: pool.length,
      results: pool.slice(0, limit).map(fmtPost),
    }, null, 2));
    break;
  }

  case "posts-search": {
    const q = rest.filter((r, i) => !r.startsWith("--") && !(i > 0 && rest[i-1].startsWith("--"))).join(" ").toLowerCase();
    const limit = parseInt(globalFlags.limit || "20");
    const data = loadPosts();
    const results = data.posts.filter((p) =>
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      (p.contentSeries && p.contentSeries.toLowerCase().includes(q)) ||
      p.handle.toLowerCase().includes(q)
    ).slice(0, limit).map(fmtPost);
    console.log(JSON.stringify(results, null, 2));
    break;
  }

  case "posts-by-account": {
    const handle = rest[0];
    if (!handle) { console.log(JSON.stringify({ error: "handle required" })); break; }
    loadUsMajors();
    const data = loadPosts();
    const h = handle.toLowerCase();
    const m = usMajorsHandleMap.get(h);
    const posts = data.posts.filter((p) => p.handle.toLowerCase() === h);
    if (posts.length === 0) { console.log(JSON.stringify({ error: `No posts for ${handle}` })); break; }
    const sorted = [...posts].sort((a, b) => b.engRate - a.engRate);
    const sponsored = posts.filter((p) => p.sponsored).length;
    const limit = parseInt(globalFlags.limit || "50");
    console.log(JSON.stringify({
      handle: h, accountName: m ? m.accountName : h, league: m ? m.league : null,
      totalPosts: posts.length, sponsoredCount: sponsored, unsponsoredCount: posts.length - sponsored,
      avgEngagementRate_pct: +(posts.reduce((s, p) => s + p.engRate, 0) / posts.length * 100).toFixed(2),
      topPostsByEngagement: sorted.slice(0, limit).map(fmtPost),
    }, null, 2));
    break;
  }

  case "posts-opportunities": {
    const data = loadPosts();
    const flags = { ...globalFlags, sponsored: "false" };
    const pool = applyPostFilters(data.posts, flags);
    const sorted = [...pool].sort((a, b) => b.engRate - a.engRate);
    const limit = parseInt(globalFlags.limit || "20");
    console.log(JSON.stringify({
      filters: flags, totalOpportunities: pool.length,
      note: "Unsponsored posts ranked by engagement rate. Sponsorship candidates.",
      topOpportunities: sorted.slice(0, limit).map(fmtPost),
    }, null, 2));
    break;
  }

  case "posts-series-stats": {
    const data = loadPosts();
    const pool = applyPostFilters(data.posts, globalFlags).filter((p) => p.contentSeries);
    if (pool.length === 0) { console.log(JSON.stringify({ error: "No posts with series for these filters" })); break; }
    const m = new Map();
    for (const p of pool) {
      if (!m.has(p.contentSeries)) m.set(p.contentSeries, []);
      m.get(p.contentSeries).push(p);
    }
    const series = Array.from(m.entries()).map(([name, ps]) => {
      const sponsored = ps.filter((p) => p.sponsored).length;
      const avgEng = ps.reduce((s, p) => s + p.engRate, 0) / ps.length;
      return {
        name, totalPosts: ps.length, sponsoredCount: sponsored, unsponsoredCount: ps.length - sponsored,
        avgEngagementRate_pct: +(avgEng * 100).toFixed(2),
        totalImpressions: ps.reduce((s, p) => s + p.impressions, 0),
        totalEngagement: ps.reduce((s, p) => s + p.engagement, 0),
        sponsorshipOpportunityScore: +((1 - sponsored / ps.length) * avgEng * 100).toFixed(2),
      };
    }).sort((a, b) => b.sponsorshipOpportunityScore - a.sponsorshipOpportunityScore);
    console.log(JSON.stringify({ filters: globalFlags, totalSeries: series.length, series }, null, 2));
    break;
  }

  case "posts-brand": {
    const q = rest.filter((r, i) => !r.startsWith("--") && !(i > 0 && rest[i-1].startsWith("--"))).join(" ").toLowerCase();
    if (!q) { console.log(JSON.stringify({ error: "brand query required" })); break; }
    const data = loadPosts();
    const posts = data.posts.filter((p) => p.brand && p.brand.toLowerCase().includes(q));
    if (posts.length === 0) { console.log(JSON.stringify({ error: `No posts for brand '${q}'` })); break; }
    const m = new Map();
    for (const p of posts) {
      if (!m.has(p.brand)) m.set(p.brand, []);
      m.get(p.brand).push(p);
    }
    const byBrand = Array.from(m.entries()).map(([brand, ps]) => {
      const handles = new Set(ps.map((p) => p.handle));
      const leagues = new Set(ps.map((p) => p.league));
      const avgEng = ps.reduce((s, p) => s + p.engRate, 0) / ps.length;
      return {
        brand, totalPosts: ps.length, distinctAccounts: handles.size, leagues: [...leagues],
        avgEngagementRate_pct: +(avgEng * 100).toFixed(2),
        totalImpressions: ps.reduce((s, p) => s + p.impressions, 0),
        totalEngagement: ps.reduce((s, p) => s + p.engagement, 0),
        totalValue_usd: ps.reduce((s, p) => s + usd(p.totalValue), 0),
      };
    }).sort((a, b) => b.totalPosts - a.totalPosts);
    console.log(JSON.stringify({ query: q, brandsFound: byBrand.length, brands: byBrand }, null, 2));
    break;
  }

  case "posts-league-stats": {
    const data = loadPosts();
    const league = globalFlags.league || null;
    const pool = league ? data.posts.filter((p) => p.league === league) : data.posts;
    if (pool.length === 0) { console.log(JSON.stringify({ error: `No posts for league ${league}` })); break; }
    const sponsored = pool.filter((p) => p.sponsored);
    const brands = new Set(sponsored.map((p) => p.brand));
    const handles = new Set(pool.map((p) => p.handle));
    const avgEng = pool.reduce((s, p) => s + p.engRate, 0) / pool.length;
    console.log(JSON.stringify({
      league: league || "ALL", totalPosts: pool.length, distinctAccounts: handles.size,
      sponsoredCount: sponsored.length, unsponsoredCount: pool.length - sponsored.length,
      sponsoredPct: +(sponsored.length / pool.length * 100).toFixed(1),
      distinctBrands: brands.size,
      avgEngagementRate_pct: +(avgEng * 100).toFixed(2),
      totalImpressions: pool.reduce((s, p) => s + p.impressions, 0),
      totalEngagement: pool.reduce((s, p) => s + p.engagement, 0),
      totalValue_usd: pool.reduce((s, p) => s + usd(p.totalValue), 0),
    }, null, 2));
    break;
  }

  case "posts-accounts-aggregate": {
    const data = loadPosts();
    loadUsMajors();
    const pool = applyPostFilters(data.posts, globalFlags);
    if (pool.length === 0) { console.log(JSON.stringify({ error: "No posts match filters", filters: globalFlags })); break; }
    const byHandle = new Map();
    for (const p of pool) {
      if (!byHandle.has(p.handle)) byHandle.set(p.handle, []);
      byHandle.get(p.handle).push(p);
    }
    const sortBy = globalFlags.sortBy || "totalValue";
    const accountsAgg = Array.from(byHandle.entries()).map(([handle, ps]) => {
      const m = usMajorsHandleMap.get(handle.toLowerCase());
      const sponsored = ps.filter((p) => p.sponsored).length;
      const totalImpressions = ps.reduce((s, p) => s + p.impressions, 0);
      const totalEngagement = ps.reduce((s, p) => s + p.engagement, 0);
      const totalValueEur = ps.reduce((s, p) => s + p.totalValue, 0);
      const avgEng = ps.reduce((s, p) => s + p.engRate, 0) / ps.length;
      return {
        handle, accountName: m ? m.accountName : handle, league: m ? m.league : null,
        totalPosts: ps.length, sponsoredCount: sponsored, unsponsoredCount: ps.length - sponsored,
        totalImpressions, totalEngagement,
        totalValue_usd: usd(totalValueEur),
        avgValuePerPost_usd: Math.round(usd(totalValueEur) / ps.length),
        avgEngagementRate_pct: +(avgEng * 100).toFixed(2),
      };
    }).sort((a, b) => {
      if (sortBy === "totalImpressions") return b.totalImpressions - a.totalImpressions;
      if (sortBy === "totalEngagement") return b.totalEngagement - a.totalEngagement;
      if (sortBy === "avgEngRate") return b.avgEngagementRate_pct - a.avgEngagementRate_pct;
      if (sortBy === "totalPosts") return b.totalPosts - a.totalPosts;
      return b.totalValue_usd - a.totalValue_usd;
    });
    const limit = parseInt(globalFlags.limit || "10");
    console.log(JSON.stringify({
      filters: globalFlags, sortBy, totalAccounts: accountsAgg.length,
      totalPostsMatched: pool.length,
      accounts: accountsAgg.slice(0, limit),
    }, null, 2));
    break;
  }

  case "posts-stats": {
    const data = loadPosts();
    const series = new Set(data.posts.filter((p) => p.contentSeries).map((p) => p.contentSeries));
    const brands = new Set(data.posts.filter((p) => p.brand).map((p) => p.brand));
    console.log(JSON.stringify({
      coverage: "Post-level data covers NFL/NBA/MLB/MLS official team and league Instagram accounts.",
      totalPosts: data.meta.totalPosts, leagues: data.meta.leagues,
      sponsoredCount: data.meta.sponsoredCount, unsponsoredCount: data.meta.unsponsoredCount,
      distinctContentSeries: series.size, contentSeriesList: [...series].sort(),
      distinctBrands: brands.size,
    }, null, 2));
    break;
  }

  default:
    console.log(`Usage: node scripts/query-data.mjs <command> [args]

Account commands (add --mode usmajors to scope to NFL/NBA/MLB/MLS):
  search <query> [--limit N]
  top <avgPerPost|totalValue|engRate> [--category X] [--country X] [--platform X] [--limit N]
  detail <instagram|tiktok> <handle>
  filter [--category X] [--country X] [--platform X] [--minFollowers N] [--maxFollowers N] [--sortBy avgPerPost|totalValue|engRate|followers] [--limit N]
  compare <platform/handle> <platform/handle> ...
  market [country] [--category X] [--platform X]
  stats

Post commands (usmajors mode only):
  posts-top <engRate|impressions|engagement|totalValue> [--league X] [--sponsored true|false] [--brand X] [--contentSeries X] [--limit N]   — individual posts
  posts-search <query> [--limit N]
  posts-by-account <handle> [--limit N]
  posts-opportunities [--league X] [--contentSeries X] [--handle X] [--limit N]
  posts-accounts-aggregate [--league X] [--sponsored true|false] [--brand X] [--contentSeries X] [--sortBy totalValue|totalImpressions|totalEngagement|avgEngRate|totalPosts] [--limit N]   — ONE ROW PER ACCOUNT
  posts-series-stats [--league X] [--handle X]
  posts-brand <brand-query>
  posts-league-stats [--league X]
  posts-stats`);
}
