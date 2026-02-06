import { execSync } from "child_process";
import fs from "fs";
import path from "path";

let cachedPath: string | null = null;

export function getChromiumPath(): string {
  if (cachedPath && fs.existsSync(cachedPath)) {
    return cachedPath;
  }

  const candidates: string[] = [];

  if (process.env.CHROMIUM_PATH) {
    candidates.push(process.env.CHROMIUM_PATH);
  }

  try {
    const whichResult = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null", {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    if (whichResult) {
      candidates.push(whichResult);
      try {
        const resolved = execSync(`readlink -f "${whichResult}"`, { encoding: "utf-8", timeout: 3000 }).trim();
        if (resolved) candidates.push(resolved);
      } catch (e) {}
    }
  } catch (e) {}

  candidates.push(
    "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  );

  try {
    const nixProfileBin = "/home/runner/.nix-profile/bin/chromium";
    candidates.push(nixProfileBin);
  } catch (e) {}

  try {
    const envPath = process.env.PATH || "";
    const pathDirs = envPath.split(":");
    for (const dir of pathDirs) {
      if (dir.includes("nix")) {
        candidates.push(path.join(dir, "chromium"));
      }
    }
  } catch (e) {}

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      cachedPath = p;
      console.log(`[Chromium] Found at: ${cachedPath}`);
      return cachedPath;
    }
  }

  try {
    const found = execSync("find /nix/store -maxdepth 4 -name chromium -type f 2>/dev/null | head -1", {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();
    if (found && fs.existsSync(found)) {
      cachedPath = found;
      console.log(`[Chromium] Found via search: ${cachedPath}`);
      return cachedPath;
    }
  } catch (e) {
    console.log("[Chromium] Nix store search failed or timed out");
  }

  try {
    const found2 = execSync("find / -maxdepth 5 -name chromium -type f 2>/dev/null | head -1", {
      encoding: "utf-8",
      timeout: 15000,
    }).trim();
    if (found2 && fs.existsSync(found2)) {
      cachedPath = found2;
      console.log(`[Chromium] Found via deep search: ${cachedPath}`);
      return cachedPath;
    }
  } catch (e) {
    console.log("[Chromium] Deep search failed or timed out");
  }

  console.error("[Chromium] NOT FOUND. Checked candidates:", candidates.filter(c => c));
  throw new Error("Chromium browser not found. Web scrapers are unavailable in this environment.");
}
