import fs from "fs";
import path from "path";

export interface HandleMeta {
  handle: string;
  platform: "instagram" | "tiktok";
  accountName: string;
  league: "NFL" | "NBA" | "MLB" | "MLS";
  category: string;
  gender: string | null;
}

interface HandlesData {
  meta: { totalHandles: number };
  handles: HandleMeta[];
}

let cached: HandlesData | null = null;
let handleSetCache: Set<string> | null = null;
let handleMapCache: Map<string, HandleMeta> | null = null;

function load(): HandlesData {
  if (cached) return cached;
  const raw = fs.readFileSync(
    path.join(process.cwd(), "data", "us-majors-handles.json"),
    "utf-8"
  );
  cached = JSON.parse(raw);
  return cached!;
}

export function getUsMajorsHandleSet(): Set<string> {
  if (handleSetCache) return handleSetCache;
  handleSetCache = new Set(load().handles.map((h) => h.handle.toLowerCase()));
  return handleSetCache;
}

export function getUsMajorsHandleMap(): Map<string, HandleMeta> {
  if (handleMapCache) return handleMapCache;
  handleMapCache = new Map(
    load().handles.map((h) => [h.handle.toLowerCase(), h])
  );
  return handleMapCache;
}

export function getUsMajorsHandles(): HandleMeta[] {
  return load().handles;
}
