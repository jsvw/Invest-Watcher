import { storage } from "./storage";
import { runScrapeForConfig } from "./scheduler";

async function main() {
  console.log("[Scrape Job] Starting scheduled scrape run...");
  try {
    const configs = await storage.getAllEnabledScraperConfigs();
    console.log(`[Scrape Job] Found ${configs.length} enabled scraper config(s)`);

    for (const config of configs) {
      await runScrapeForConfig(config);
    }

    console.log("[Scrape Job] All scrapes complete");
  } catch (err: any) {
    console.error("[Scrape Job] Error running scrapes:", err.message);
    process.exit(1);
  }
  process.exit(0);
}

main();
