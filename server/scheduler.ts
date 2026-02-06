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

    if (scraperType === "trading212") {
      if (!creds.apiKey || !creds.apiSecret) {
        console.error(`[Scheduler] Missing API credentials for Trading 212 platform ${platformId}`);
        await storage.updateScraperConfig(id, userId, {
          lastScrapeAt: new Date(),
          lastScrapeStatus: "error",
          lastScrapeMessage: "Missing API key or secret. Please re-save credentials.",
        });
        return;
      }

      if (creds.ticker) {
        const { fetchPositions, fetchDividends, fetchOrderHistoryForTicker } = await import("./scrapers/trading212");
        const posMap = await fetchPositions(creds.apiKey, creds.apiSecret);
        const pos = posMap.get(creds.ticker);

        if (!pos) {
          await storage.updateScraperConfig(id, userId, {
            lastScrapeAt: new Date(),
            lastScrapeStatus: "error",
            lastScrapeMessage: `Ticker "${creds.ticker}" not found in portfolio`,
          });
          console.log(`[Scheduler] Ticker ${creds.ticker} not found for platform ${platformId}`);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
        const orderHistory = await fetchOrderHistoryForTicker(creds.apiKey, creds.apiSecret, creds.ticker);
        const totalInvested = orderHistory.totalInvestedEur;
        const totalPpl = (pos.ppl || 0) + (pos.fxPpl || 0);
        const totalValue = totalInvested + totalPpl;
        const pplPercent = totalInvested > 0 ? (totalPpl / totalInvested) * 100 : 0;
        const avgPriceEur = pos.quantity > 0 ? totalInvested / pos.quantity : 0;
        const currentPriceEur = pos.quantity > 0 ? totalValue / pos.quantity : 0;

        if (totalValue > 0) {
          const existingVals = await storage.getValuations(platformId);
          const sameDayVal = existingVals.find(v =>
            new Date(v.date).toISOString().split("T")[0] === todayStr
          );
          if (sameDayVal) {
            await storage.updateValuation(sameDayVal.id, { value: totalValue.toFixed(2) });
          } else {
            await storage.createValuation({ platformId, value: totalValue.toFixed(2), date: today });
          }
        }

        if (totalInvested > 0) {
          const existingInvestments = await storage.getInvestments(platformId);
          const existingWithdrawals = await storage.getWithdrawals(platformId);
          const nonSyncInvestments = existingInvestments.filter(inv => !inv.notes?.startsWith("Trading 212 sync adjustment"));
          const totalDeposited = nonSyncInvestments.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
          const totalWithdrawn = existingWithdrawals.reduce((sum, w) => sum + parseFloat(w.amount), 0);
          const currentNetInvested = totalDeposited - totalWithdrawn;
          const diff = totalInvested - currentNetInvested;

          const existingSyncAdj = existingInvestments.filter(inv => inv.notes?.startsWith("Trading 212 sync adjustment"));
          if (existingSyncAdj.length > 0) {
            const adjId = existingSyncAdj[existingSyncAdj.length - 1].id;
            if (Math.abs(diff) >= 0.01) {
              await storage.updateInvestment(adjId, {
                amount: diff.toFixed(2),
                date: today,
                notes: `Trading 212 sync adjustment (T212 total: ${totalInvested.toFixed(2)})`,
              });
            }
          } else if (Math.abs(diff) >= 0.01) {
            await storage.createInvestment({
              platformId,
              amount: diff.toFixed(2),
              date: today,
              notes: `Trading 212 sync adjustment (T212 total: ${totalInvested.toFixed(2)})`,
            });
          }
        }

        try {
          await storage.saveTrading212Holdings(platformId, userId, today, [{
            ticker: creds.ticker,
            shares: pos.quantity.toString(),
            currentPrice: currentPriceEur.toString(),
            averagePrice: avgPriceEur.toString(),
            value: totalValue.toFixed(2),
            ppl: totalPpl.toString(),
            currentShare: "100",
            expectedShare: "100",
            result: totalPpl.toString(),
          }]);
          console.log(`[Scheduler] Saved T212 single-ticker holdings snapshot for platform ${platformId}`);
        } catch (holdingsErr: any) {
          console.error(`[Scheduler] Failed to save T212 holdings for platform ${platformId}:`, holdingsErr.message);
        }

        try {
          await new Promise(resolve => setTimeout(resolve, 5000));
          const divMap = await fetchDividends(creds.apiKey, creds.apiSecret);
          const allDivRecords: { ticker: string; amount: string; paidOn: string; quantity: string | null }[] = [];
          divMap.forEach((data, ticker) => {
            for (const record of data.history) {
              allDivRecords.push({
                ticker,
                amount: record.amount.toString(),
                paidOn: record.paidOn,
                quantity: record.quantity != null ? record.quantity.toString() : null,
              });
            }
          });
          if (allDivRecords.length > 0) {
            await storage.saveTrading212Dividends(platformId, userId, allDivRecords);
            console.log(`[Scheduler] Saved ${allDivRecords.length} T212 dividend records for platform ${platformId}`);
          }
        } catch (divErr: any) {
          console.error(`[Scheduler] Failed to save T212 dividends for platform ${platformId}:`, divErr.message);
        }

        await storage.updateScraperConfig(id, userId, {
          lastScrapeAt: new Date(),
          lastScrapeStatus: "success",
          lastScrapeMessage: `${creds.ticker}: Value=${totalValue.toFixed(2)}, Invested=${totalInvested.toFixed(2)}, P/L=${totalPpl.toFixed(2)} (${pplPercent.toFixed(1)}%), Qty=${pos.quantity}, Orders=${orderHistory.orderCount}`,
        });

        console.log(`[Scheduler] T212 single-ticker sync complete for platform ${platformId}: ${creds.ticker}=${totalValue.toFixed(2)}`);
        return;
      }

      const { scrapeTrading212, fetchPositions, fetchDividends } = await import("./scrapers/trading212");
      const t212Data = await scrapeTrading212(creds.apiKey, creds.apiSecret);

      const pieName = creds.pieName || "";
      const matchedPie = t212Data.pies.find(p => {
        if (pieName) {
          return p.pieName.toLowerCase().includes(pieName.toLowerCase()) ||
                 pieName.toLowerCase().includes(p.pieName.toLowerCase());
        }
        return p.pieName.toLowerCase().includes(platform.name.toLowerCase()) ||
               platform.name.toLowerCase().includes(p.pieName.toLowerCase());
      });

      if (!matchedPie) {
        const availablePies = t212Data.pies.map(p => p.pieName).join(", ");
        await storage.updateScraperConfig(id, userId, {
          lastScrapeAt: new Date(),
          lastScrapeStatus: "error",
          lastScrapeMessage: `No matching pie found. Available: ${availablePies}`,
        });
        console.log(`[Scheduler] No matching pie for platform ${platformId}`);
        return;
      }

      const totalValue = matchedPie.currentValue;
      if (totalValue > 0) {
        const existingVals = await storage.getValuations(platformId);
        const sameDayVal = existingVals.find(v =>
          new Date(v.date).toISOString().split("T")[0] === todayStr
        );
        if (sameDayVal) {
          await storage.updateValuation(sameDayVal.id, { value: totalValue.toFixed(2) });
        } else {
          await storage.createValuation({
            platformId,
            value: totalValue.toFixed(2),
            date: today,
          });
        }
      }

      const t212Invested = matchedPie.investedValue;
      if (t212Invested > 0) {
        const existingInvestments = await storage.getInvestments(platformId);
        const existingWithdrawals = await storage.getWithdrawals(platformId);
        const nonSyncInvestments = existingInvestments.filter(inv => !inv.notes?.startsWith("Trading 212 sync adjustment"));
        const totalDeposited = nonSyncInvestments.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
        const totalWithdrawn = existingWithdrawals.reduce((sum, w) => sum + parseFloat(w.amount), 0);
        const currentNetInvested = totalDeposited - totalWithdrawn;
        const diff = t212Invested - currentNetInvested;

        const existingSyncAdj = existingInvestments.filter(inv => inv.notes?.startsWith("Trading 212 sync adjustment"));
        if (existingSyncAdj.length > 0) {
          const adjId = existingSyncAdj[existingSyncAdj.length - 1].id;
          if (Math.abs(diff) >= 0.01) {
            await storage.updateInvestment(adjId, {
              amount: diff.toFixed(2),
              date: today,
              notes: `Trading 212 sync adjustment (T212 total: ${t212Invested.toFixed(2)})`,
            });
          }
        } else if (Math.abs(diff) >= 0.01) {
          await storage.createInvestment({
            platformId,
            amount: diff.toFixed(2),
            date: today,
            notes: `Trading 212 sync adjustment (T212 total: ${t212Invested.toFixed(2)})`,
          });
        }
      }

      try {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const posMap = await fetchPositions(creds.apiKey, creds.apiSecret);
        const holdingsToSave = matchedPie.instruments.map(inst => {
          const pos = posMap.get(inst.ticker);
          return {
            ticker: inst.ticker,
            shares: inst.shares?.toString() ?? null,
            currentPrice: pos?.currentPrice?.toString() ?? null,
            averagePrice: pos?.averagePrice?.toString() ?? null,
            value: pos ? ((pos.pieQuantity || pos.quantity) * pos.currentPrice).toFixed(2) : null,
            ppl: pos?.ppl?.toString() ?? null,
            currentShare: inst.currentShare?.toString() ?? null,
            expectedShare: inst.expectedShare?.toString() ?? null,
            result: inst.result?.toString() ?? null,
          };
        });
        await storage.saveTrading212Holdings(platformId, userId, today, holdingsToSave);
        console.log(`[Scheduler] Saved ${holdingsToSave.length} T212 holdings snapshots for platform ${platformId}`);
      } catch (holdingsErr: any) {
        console.error(`[Scheduler] Failed to save T212 holdings for platform ${platformId}:`, holdingsErr.message);
      }

      try {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const divMap = await fetchDividends(creds.apiKey, creds.apiSecret);
        const allDivRecords: { ticker: string; amount: string; paidOn: string; quantity: string | null }[] = [];
        divMap.forEach((data, ticker) => {
          for (const record of data.history) {
            allDivRecords.push({
              ticker,
              amount: record.amount.toString(),
              paidOn: record.paidOn,
              quantity: record.quantity != null ? record.quantity.toString() : null,
            });
          }
        });
        await storage.saveTrading212Dividends(platformId, userId, allDivRecords);
        console.log(`[Scheduler] Saved ${allDivRecords.length} T212 dividend records for platform ${platformId}`);
      } catch (divErr: any) {
        console.error(`[Scheduler] Failed to save T212 dividends for platform ${platformId}:`, divErr.message);
      }

      await storage.updateScraperConfig(id, userId, {
        lastScrapeAt: new Date(),
        lastScrapeStatus: "success",
        lastScrapeMessage: `Pie "${matchedPie.pieName}": Value=${totalValue.toFixed(2)}, Invested=${matchedPie.investedValue.toFixed(2)}`,
      });

      console.log(`[Scheduler] T212 sync complete for platform ${platformId}: ${totalValue.toFixed(2)}`);
      return;
    }

    if (scraperType === "robocash" || scraperType === "crowdpear" || scraperType === "goldrepublic") {
      let balanceData: { totalBalance: number; scrapedAt: Date };
      if (scraperType === "robocash") {
        const { scrapeRoboCash } = await import("./scrapers/robocash");
        balanceData = await scrapeRoboCash(creds.email, creds.password);
      } else if (scraperType === "goldrepublic") {
        const { scrapeGoldRepublic } = await import("./scrapers/goldrepublic");
        balanceData = await scrapeGoldRepublic(creds.username, creds.email, creds.password);
      } else {
        const { scrapeCrowdPear } = await import("./scrapers/crowdpear");
        balanceData = await scrapeCrowdPear(creds.email, creds.password, creds.gmailAppPassword, creds.gmailEmail);
      }

      if (balanceData.totalBalance > 0) {
        const existingVals = await storage.getValuations(platformId);
        const sameDayVal = existingVals.find(v =>
          new Date(v.date).toISOString().split("T")[0] === todayStr
        );
        if (sameDayVal) {
          await storage.updateValuation(sameDayVal.id, { value: balanceData.totalBalance.toFixed(2) });
        } else {
          await storage.createValuation({
            platformId,
            value: balanceData.totalBalance.toFixed(2),
            date: today,
          });
        }
      }

      await storage.updateScraperConfig(id, userId, {
        lastScrapeAt: new Date(),
        lastScrapeStatus: "success",
        lastScrapeMessage: `Total: €${balanceData.totalBalance.toFixed(2)}`,
      });

      console.log(`[Scheduler] Scrape complete for platform ${platformId}: €${balanceData.totalBalance.toFixed(2)}`);
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
