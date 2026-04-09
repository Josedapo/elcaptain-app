#!/usr/bin/env node

/**
 * Data query tool for ElCaptain.
 * Claude Code can run this script to query the VPF accounts database.
 *
 * Usage:
 *   node scripts/query-data.mjs search "messi"
 *   node scripts/query-data.mjs top vpf --category Athletes --country Spain --limit 5
 *   node scripts/query-data.mjs detail instagram leomessi
 *   node scripts/query-data.mjs filter --category "Media & Creators" --platform tiktok --minFollowers 100000 --sortBy engRate --limit 10
 *   node scripts/query-data.mjs compare instagram/leomessi instagram/cristiano
 *   node scripts/query-data.mjs stats
 */

import fs from "fs";
import path from "path";

const dataPath = path.join(process.cwd(), "data", "accounts.json");
const ratePath = path.join(process.cwd(), "data", "exchange-rate.json");
const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
const rate = JSON.parse(fs.readFileSync(ratePath, "utf-8")).rate;
const accounts = raw.accounts;
const meta = raw.meta;

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

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case "search": {
    const q = rest.filter((r) => !r.startsWith("--")).join(" ").toLowerCase();
    const flags = parseArgs(rest);
    const limit = parseInt(flags.limit || "10");
    const results = accounts
      .filter((a) => a.name.toLowerCase().includes(q) || a.handle.toLowerCase().includes(q))
      .slice(0, limit)
      .map(fmt);
    console.log(JSON.stringify(results, null, 2));
    break;
  }

  case "top": {
    const metric = rest[0] || "vpf";
    const flags = parseArgs(rest.slice(1));
    let filtered = [...accounts];
    if (flags.category) filtered = filtered.filter((a) => matchCat(a, flags.category));
    if (flags.country) filtered = filtered.filter((a) => matchCountry(a, flags.country));
    if (flags.platform) filtered = filtered.filter((a) => a.platform === flags.platform);
    const limit = parseInt(flags.limit || "10");
    filtered.sort((a, b) => {
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
    const a = accounts.find(
      (x) => x.platform === platform && (x.handle.toLowerCase() === handle.toLowerCase() || x.slug.toLowerCase() === handle.toLowerCase())
    );
    console.log(a ? JSON.stringify(fmt(a), null, 2) : JSON.stringify({ error: "Account not found" }));
    break;
  }

  case "filter": {
    const flags = parseArgs(rest);
    let filtered = [...accounts];
    if (flags.category) filtered = filtered.filter((a) => matchCat(a, flags.category));
    if (flags.country) filtered = filtered.filter((a) => matchCountry(a, flags.country));
    if (flags.platform) filtered = filtered.filter((a) => a.platform === flags.platform);
    if (flags.minFollowers) filtered = filtered.filter((a) => a.followers >= parseInt(flags.minFollowers));
    if (flags.maxFollowers) filtered = filtered.filter((a) => a.followers <= parseInt(flags.maxFollowers));
    const sortBy = flags.sortBy || "avgPerPost";
    filtered.sort((a, b) => {
      if (sortBy === "avgPerPost") return (b.posts > 0 ? b.totalValue/b.posts : 0) - (a.posts > 0 ? a.totalValue/a.posts : 0);
      if (sortBy === "totalValue") return b.totalValue - a.totalValue;
      if (sortBy === "engRate") return b.engRate - a.engRate;
      return b.followers - a.followers;
    });
    const limit = parseInt(flags.limit || "20");
    console.log(JSON.stringify(filtered.slice(0, limit).map(fmt), null, 2));
    break;
  }

  case "compare": {
    const pairs = rest.filter((r) => !r.startsWith("--")).map((r) => {
      const [p, h] = r.split("/");
      return accounts.find(
        (a) => a.platform === p && (a.handle.toLowerCase() === h.toLowerCase() || a.slug.toLowerCase() === h.toLowerCase())
      );
    });
    console.log(JSON.stringify(pairs.filter(Boolean).map(fmt), null, 2));
    break;
  }

  case "market": {
    // Full market overview with flexible filters: country, category, platform
    const mFlags = parseArgs(rest);
    const flagValues = new Set(Object.values(mFlags));
    const positionalArgs = rest.filter((r) => !r.startsWith("--") && !flagValues.has(r)).join(" ");
    const mCountry = mFlags.country || positionalArgs || null;
    const mCategory = mFlags.category || null;
    const mPlatform = mFlags.platform || null;

    let pool = [...accounts];
    if (mCountry) pool = pool.filter((a) => matchCountry(a, mCountry));
    if (mCategory) pool = pool.filter((a) => matchCat(a, mCategory));
    if (mPlatform) pool = pool.filter((a) => a.platform === mPlatform);

    if (pool.length === 0) { console.log(JSON.stringify({ error: "No accounts found for these filters", filters: { country: mCountry, category: mCategory, platform: mPlatform } })); break; }

    const platforms = { instagram: pool.filter((a) => a.platform === "instagram").length, tiktok: pool.filter((a) => a.platform === "tiktok").length };

    // Group by the dimension NOT filtered: if country specified, group by category. If category specified, group by country. If both, group by platform.
    let groupBy, groups;
    if (mCategory && mCountry) {
      groupBy = "platform";
      groups = [...new Set(pool.map((a) => a.platform))].sort().map((g) => {
        const gAccounts = pool.filter((a) => a.platform === g);
        gAccounts.sort((a, b) => (b.posts > 0 ? b.totalValue/b.posts : 0) - (a.posts > 0 ? a.totalValue/a.posts : 0));
        return { name: g, totalAccounts: gAccounts.length, top3_byAvgPerPost: gAccounts.slice(0, 3).map(fmt), avgEngRate: +(gAccounts.reduce((s, a) => s + a.engRate, 0) / gAccounts.length * 100).toFixed(2), totalMarketValue_usd: gAccounts.reduce((s, a) => s + usd(a.totalValue), 0) };
      });
    } else if (mCategory) {
      groupBy = "country";
      const countries = [...new Set(pool.map((a) => a.country || "Global"))];
      groups = countries.map((c) => {
        const gAccounts = pool.filter((a) => (a.country || "Global") === c);
        gAccounts.sort((a, b) => (b.posts > 0 ? b.totalValue/b.posts : 0) - (a.posts > 0 ? a.totalValue/a.posts : 0));
        return { name: c, totalAccounts: gAccounts.length, top3_byAvgPerPost: gAccounts.slice(0, 3).map(fmt), avgEngRate: +(gAccounts.reduce((s, a) => s + a.engRate, 0) / gAccounts.length * 100).toFixed(2), totalMarketValue_usd: gAccounts.reduce((s, a) => s + usd(a.totalValue), 0) };
      }).sort((a, b) => b.totalAccounts - a.totalAccounts).slice(0, 10);
    } else {
      groupBy = "category";
      const cats = [...new Set(pool.map((a) => mapCat(a.category)))].sort();
      groups = cats.map((cat) => {
        const gAccounts = pool.filter((a) => mapCat(a.category) === cat);
        gAccounts.sort((a, b) => (b.posts > 0 ? b.totalValue/b.posts : 0) - (a.posts > 0 ? a.totalValue/a.posts : 0));
        return { name: cat, totalAccounts: gAccounts.length, top3_byAvgPerPost: gAccounts.slice(0, 3).map(fmt), avgEngRate: +(gAccounts.reduce((s, a) => s + a.engRate, 0) / gAccounts.length * 100).toFixed(2), totalMarketValue_usd: gAccounts.reduce((s, a) => s + usd(a.totalValue), 0) };
      });
    }

    console.log(JSON.stringify({
      filters: { country: mCountry || "all", category: mCategory || "all", platform: mPlatform || "all" },
      totalAccounts: pool.length,
      platforms,
      groupBy,
      groups,
    }, null, 2));
    break;
  }

  case "stats": {
    const categories = [...new Set(accounts.map((a) => mapCat(a.category)))].sort();
    const countries = [...new Set(accounts.map((a) => a.country || "Global"))].sort();
    console.log(
      JSON.stringify({
        totalAccounts: meta.totalAccounts,
        platforms: meta.platforms,
        dataMonth: meta.dataMonth,
        categories,
        countriesCount: countries.length,
        topCountries: countries
          .map((c) => ({ country: c, count: accounts.filter((a) => (a.country || "Global") === c).length }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15),
      }, null, 2)
    );
    break;
  }

  default:
    console.log(`Usage: node scripts/query-data.mjs <command> [args]
Commands:
  search <query> [--limit N]
  top <vpf|totalValue|engRate> [--category X] [--country X] [--platform X] [--limit N]
  detail <instagram|tiktok> <handle>
  filter [--category X] [--country X] [--platform X] [--minFollowers N] [--maxFollowers N] [--sortBy vpf|totalValue|engRate|followers] [--limit N]
  compare <platform/handle> <platform/handle> ...
  stats`);
}
