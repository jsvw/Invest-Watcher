import { storage } from "./storage";

export async function importInvestmentData() {
  const data = [
    { platform: "Cash", date: "2024-07-10", invested: 150, value: 400 },
    { platform: "Cash", date: "2024-08-10", invested: 250, value: 650 },
    { platform: "Cash", date: "2024-09-10", invested: 600, value: 1250 },
    { platform: "Cash", date: "2024-10-10", invested: 250, value: 1250 },
    { platform: "Cash", date: "2024-11-10", invested: 250, value: 1500 },
    { platform: "Cash", date: "2024-12-10", invested: 250, value: 1750 },
    { platform: "Cash", date: "2025-01-10", invested: 0, value: 1750 },
    { platform: "Cash", date: "2025-02-10", invested: 750, value: 2500 },
    { platform: "Cash", date: "2025-03-10", invested: 1500, value: 4000 },
    { platform: "Cash", date: "2025-04-10", invested: 250, value: 4250 },
    { platform: "Cash", date: "2025-05-10", invested: 750, value: 5000 },
    { platform: "Cash", date: "2025-06-10", invested: 1500, value: 6500 },
    { platform: "Cash", date: "2025-07-10", invested: 500, value: 7000 },
    { platform: "Cash", date: "2025-08-10", invested: 1000, value: 8000 },
    { platform: "Cash", date: "2025-09-10", invested: 0, value: 8000 },
    { platform: "Cash", date: "2025-10-10", invested: 0, value: 8000 },
    { platform: "Cash", date: "2025-11-10", invested: 0, value: 8000 },
    { platform: "Cash", date: "2025-12-10", invested: 0, value: 8000 },
    { platform: "Cash", date: "2026-01-10", invested: 0, value: 8000 },
    { platform: "Cash", date: "2026-02-10", invested: 0, value: 8000 },
    { platform: "Corda", date: "2024-11-10", invested: 1000, value: 1000 },
    { platform: "Corda", date: "2024-12-10", invested: 0, value: 1000 },
    { platform: "Corda", date: "2025-01-10", invested: 883.67, value: 1883.67 },
    { platform: "Corda", date: "2025-02-10", invested: 382.89, value: 2266.56 },
    { platform: "Corda", date: "2025-03-10", invested: 0, value: 2266.56 },
    { platform: "Corda", date: "2025-04-10", invested: 0, value: 2266.56 },
    { platform: "Corda", date: "2025-05-10", invested: 0, value: 2266.56 },
    { platform: "Corda", date: "2025-06-10", invested: 0, value: 2266.56 },
    { platform: "Corda", date: "2025-07-10", invested: 411.52, value: 2681.08 },
    { platform: "Corda", date: "2025-08-10", invested: 0, value: 2681.08 },
    { platform: "Corda", date: "2025-09-10", invested: 380, value: 3061.08 },
    { platform: "Corda", date: "2025-10-10", invested: 0, value: 3061.08 },
    { platform: "Corda", date: "2025-11-10", invested: 0, value: 3061.11 },
    { platform: "Corda", date: "2025-12-10", invested: 0, value: 3061.11 },
    { platform: "Corda", date: "2026-01-10", invested: 0, value: 3061.11 },
    { platform: "Corda", date: "2026-02-10", invested: 0, value: 3061.11 },
    { platform: "Synvest", date: "2024-07-10", invested: 500, value: 500 },
    { platform: "Synvest", date: "2024-08-10", invested: 0, value: 502.25 },
    { platform: "Synvest", date: "2024-09-10", invested: 100, value: 604.51 },
    { platform: "Synvest", date: "2024-10-10", invested: 100, value: 707.24 },
    { platform: "Synvest", date: "2024-11-10", invested: 100, value: 810.41 },
    { platform: "Synvest", date: "2024-12-10", invested: 100, value: 914.06 },
    { platform: "Synvest", date: "2025-01-10", invested: 100, value: 1018.89 },
    { platform: "Synvest", date: "2025-02-10", invested: 250, value: 1274.27 },
    { platform: "Synvest", date: "2025-03-10", invested: 100, value: 1381.00 },
    { platform: "Synvest", date: "2025-04-10", invested: 100, value: 1488.30 },
    { platform: "Synvest", date: "2025-05-10", invested: 100, value: 1596.16 },
    { platform: "Synvest", date: "2025-06-10", invested: 500, value: 2104.59 },
    { platform: "Synvest", date: "2025-07-10", invested: 0, value: 2115.71 },
    { platform: "Synvest", date: "2025-08-10", invested: 0, value: 2126.89 },
    { platform: "Synvest", date: "2025-09-10", invested: 500, value: 2638.12 },
    { platform: "Synvest", date: "2025-10-10", invested: 0, value: 2652.06 },
    { platform: "Synvest", date: "2025-11-10", invested: 0, value: 2666.07 },
    { platform: "Synvest", date: "2025-12-10", invested: 0, value: 2680.16 },
    { platform: "Synvest", date: "2026-01-10", invested: 0, value: 2694.32 },
    { platform: "Synvest", date: "2026-02-10", invested: 0, value: 2694.32 }
  ];

  const platformMap = new Map();
  const existingPlatforms = await storage.getPlatforms();
  
  for (const p of existingPlatforms) {
    platformMap.set(p.name, p.id);
  }

  for (const entry of data) {
    let platformId = platformMap.get(entry.platform);
    
    if (!platformId) {
      const newPlatform = await storage.createPlatform({
        name: entry.platform,
        category: "Other",
        description: `Imported platform: ${entry.platform}`,
        color: "#" + Math.floor(Math.random()*16777215).toString(16)
      });
      platformId = newPlatform.id;
      platformMap.set(entry.platform, platformId);
    }

    const date = new Date(entry.date);

    if (entry.invested > 0) {
      await storage.createInvestment({
        platformId,
        amount: entry.invested.toString(),
        date,
        notes: "Imported from spreadsheet"
      });
    }

    await storage.createValuation({
      platformId,
      value: entry.value.toString(),
      date
    });
  }

  console.log("Data import complete!");
}
