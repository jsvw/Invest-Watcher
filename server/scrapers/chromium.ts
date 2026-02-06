import { execSync } from "child_process";
import fs from "fs";

let cachedPath: string | null = null;

export function getChromiumPath(): string {
  if (cachedPath && fs.existsSync(cachedPath)) {
    return cachedPath;
  }

  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
    cachedPath = process.env.CHROMIUM_PATH;
    return cachedPath;
  }

  try {
    const whichResult = execSync("which chromium", { encoding: "utf-8" }).trim();
    if (whichResult && fs.existsSync(whichResult)) {
      const resolved = execSync(`readlink -f "${whichResult}"`, { encoding: "utf-8" }).trim();
      cachedPath = resolved || whichResult;
      return cachedPath;
    }
  } catch (e) {}

  const knownPaths = [
    "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ];

  for (const p of knownPaths) {
    if (fs.existsSync(p)) {
      cachedPath = p;
      return cachedPath;
    }
  }

  try {
    const found = execSync("find /nix/store -maxdepth 3 -name chromium -type f 2>/dev/null | head -1", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (found && fs.existsSync(found)) {
      cachedPath = found;
      return cachedPath;
    }
  } catch (e) {}

  throw new Error("Chromium not found. Please set CHROMIUM_PATH environment variable.");
}
