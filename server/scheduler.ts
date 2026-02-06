import cron from "node-cron";
import { storage } from "./storage";
import { decrypt } from "./encryption";

async function runScrapeForConfig(config: any) {
  const { platformId, userId, scraperType, id } = config;

  console.log(`[Scheduler] Running scrape for platform ${platformId}, user ${userId}, type ${scraperType}`);

  let creds;
  try {
    const decrypted = decrypt(config.credentials);
    creds = JSON.parse(decrypted);
  } catch {
    try {
      creds = JSON.parse(config.credentials);
    } catch {
      console.error(`[Scheduler] Failed to decrypt credentials for platform ${platformId}`);
      await storage.updateScraperConfig(id, userId, {
        lastScrapeAt: new Date(),
        lastScrapeStatus: "error",
        lastScrapeMessage: "Failed to decrypt credentials",
      });
      return;
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  try {
    const platform = await storage.getPlatform(platformId, userId);
    if (!platform) {
      console.log(`[Scheduler] Platform ${platformId} not found for user ${userId}`);
      return;
    }

    if (scraperType === "robocash") {
      const { scrapeRoboCash } = await import("./scrapers/robocash");
      const robocashData = await scrapeRoboCash(creds.email, creds.password);

      if (robocashData.totalBalance > 0) {
        const existingVals = await storage.getValuations(platformId);
        const sameDayVal = existingVals.find(v =>
          new Date(v.date).toISOString().split("T")[0] === todayStr
        );
        if (sameDayVal) {
          await storage.updateValuation(sameDayVal.id, { value: robocashData.totalBalance.toFixed(2) });
        } else {
          await storage.createValuation({
            platformId,
            value: robocashData.totalBalance.toFixed(2),
            date: today,
          });
        }
      }

      await storage.updateScraperConfig(id, userId, {
        lastScrapeAt: new Date(),
        lastScrapeStatus: "success",
        lastScrapeMessage: `Total: €${robocashData.totalBalance.toFixed(2)}`,
      });

      console.log(`[Scheduler] Scrape complete for platform ${platformId}: €${robocashData.totalBalance.toFixed(2)}`);
      return;
    }

    let scraperResult;
    if (scraperType === "monefit") {
      const { scrapeMonefit } = await import("./scrapers/monefit");
      scraperResult = await scrapeMonefit(creds.email, creds.password);
    } else {
      console.log(`[Scheduler] Unknown scraper type: ${scraperType}`);
      return;
    }

    if (scraperResult.totalBalance > 0) {
      const existingVals = await storage.getValuations(platformId);
      const sameDayVal = existingVals.find(v =>
        new Date(v.date).toISOString().split("T")[0] === todayStr
      );
      if (sameDayVal) {
        await storage.updateValuation(sameDayVal.id, { value: scraperResult.totalBalance.toFixed(2) });
      } else {
        await storage.createValuation({
          platformId,
          value: scraperResult.totalBalance.toFixed(2),
          date: today,
        });
      }
    }

    if (scraperResult.totalInvested > 0) {
      const existingInvestments = await storage.getInvestments(platformId);
      const existingWithdrawals = await storage.getWithdrawals(platformId);
      const currentTotalInvested = existingInvestments.reduce((sum, i) => sum + Number(i.amount), 0);
      const currentTotalWithdrawn = existingWithdrawals.reduce((sum, w) => sum + Number(w.amount), 0);
      const currentNet = currentTotalInvested - currentTotalWithdrawn;
      const difference = scraperResult.totalInvested - currentNet;

      if (Math.abs(difference) >= 0.01) {
        if (difference > 0) {
          await storage.createInvestment({
            platformId,
            amount: difference.toFixed(2),
            date: today,
            notes: "Auto-scraped adjustment",
          });
        } else {
          await storage.createWithdrawal({
            platformId,
            amount: Math.abs(difference).toFixed(2),
            date: today,
            notes: "Auto-scraped adjustment",
          });
        }
      }
    }

    if ((platform.platformMode === "asset_returns" || platform.platformMode === "item_valuations") && scraperResult.totalBalance > 0) {
      const existingAssets = await storage.getAssets(platformId);

      const upsertAssetValuation = async (assetId: number, value: number) => {
        const existingVals = await storage.getAssetValuations(assetId);
        const sameDayVal = existingVals.find(v =>
          new Date(v.date).toISOString().split("T")[0] === todayStr
        );
        if (sameDayVal) {
          await storage.updateAssetValuation(sameDayVal.id, { value: value.toFixed(2) });
        } else {
          await storage.createAssetValuation({
            assetId,
            value: value.toFixed(2),
            date: today,
            notes: "Auto-scraped",
          });
        }
      };

      for (const vault of scraperResult.vaults) {
        const matchedAsset = existingAssets.find(a =>
          a.name.toLowerCase().includes(vault.name.toLowerCase()) ||
          vault.name.toLowerCase().includes(a.name.toLowerCase())
        );
        if (matchedAsset) {
          await upsertAssetValuation(matchedAsset.id, vault.currentValue);
        }
      }

      if (scraperResult.mainBalance > 0) {
        const mainAsset = existingAssets.find(a =>
          a.name.toLowerCase().includes("main") ||
          a.name.toLowerCase().includes("smart saver") ||
          a.name.toLowerCase().includes("smartsaver")
        );
        if (mainAsset) {
          await upsertAssetValuation(mainAsset.id, scraperResult.mainBalance);
        }
      }
    }

    await storage.updateScraperConfig(id, userId, {
      lastScrapeAt: new Date(),
      lastScrapeStatus: "success",
      lastScrapeMessage: `Total: €${scraperResult.totalBalance.toFixed(2)}, Invested: €${scraperResult.totalInvested.toFixed(2)}, Vaults: ${scraperResult.vaults.length}`,
    });

    console.log(`[Scheduler] Scrape complete for platform ${platformId}: €${scraperResult.totalBalance.toFixed(2)}`);
  } catch (err: any) {
    console.error(`[Scheduler] Scrape failed for platform ${platformId}:`, err.message);
    await storage.updateScraperConfig(id, userId, {
      lastScrapeAt: new Date(),
      lastScrapeStatus: "error",
      lastScrapeMessage: err.message || "Scrape failed",
    });
  }
}

export function startScheduler() {
  cron.schedule("0 9 * * *", async () => {
    console.log("[Scheduler] Starting daily scrape at 09:00...");
    try {
      const configs = await storage.getAllEnabledScraperConfigs();
      console.log(`[Scheduler] Found ${configs.length} enabled scraper config(s)`);

      for (const config of configs) {
        await runScrapeForConfig(config);
      }

      console.log("[Scheduler] Daily scrape complete");
    } catch (err: any) {
      console.error("[Scheduler] Error running scheduled scrape:", err.message);
    }
  });

  console.log("[Scheduler] Daily scrape scheduled for 09:00");
}
