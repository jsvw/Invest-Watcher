import { db } from "./db";
import {
  platforms,
  investments,
  valuations,
  assets,
  assetValuations,
  type Platform,
  type InsertPlatform,
  type Investment,
  type InsertInvestment,
  type Valuation,
  type InsertValuation,
  type Asset,
  type InsertAsset,
  type AssetValuation,
  type InsertAssetValuation,
  type PlatformResponse,
  type AssetResponse
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Platforms
  getPlatforms(): Promise<PlatformResponse[]>;
  getPlatform(id: number): Promise<PlatformResponse | undefined>;
  createPlatform(platform: InsertPlatform): Promise<Platform>;

  // Investments
  getInvestments(platformId: number): Promise<Investment[]>;
  createInvestment(investment: InsertInvestment): Promise<Investment>;
  updateInvestment(id: number, investment: Partial<InsertInvestment>): Promise<Investment>;
  getAllInvestments(): Promise<Investment[]>; // For aggregate calculations

  // Valuations
  getValuations(platformId: number): Promise<Valuation[]>;
  createValuation(valuation: InsertValuation): Promise<Valuation>;
  updateValuation(id: number, valuation: Partial<InsertValuation>): Promise<Valuation>;
  getLatestValuations(): Promise<Map<number, number>>; // Map platformId -> value

  // Assets
  getAssets(platformId: number): Promise<AssetResponse[]>;
  getAsset(id: number): Promise<AssetResponse | undefined>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  updateAsset(id: number, asset: Partial<InsertAsset>): Promise<Asset>;
  deleteAsset(id: number): Promise<void>;
  exitAsset(id: number, exitDate: Date, exitPrice: string): Promise<Asset>;

  // Asset Valuations
  getAssetValuations(assetId: number): Promise<AssetValuation[]>;
  createAssetValuation(valuation: InsertAssetValuation): Promise<AssetValuation>;
  updateAssetValuation(id: number, valuation: Partial<InsertAssetValuation>): Promise<AssetValuation>;

  // Asset Performance History
  getAssetPerformanceHistory(platformId: number): Promise<{ date: string; assets: { id: number; name: string; key: string; value: number }[] }[]>;
}

export class DatabaseStorage implements IStorage {
  async getPlatforms(): Promise<PlatformResponse[]> {
    const allPlatforms = await db.select().from(platforms);
    const allValuations = await db.select().from(valuations).orderBy(desc(valuations.date));
    const allInvestments = await db.select().from(investments);

    const latestValuationMap = new Map<number, any>();
    for (const val of allValuations) {
      if (!latestValuationMap.has(val.platformId)) {
        latestValuationMap.set(val.platformId, val);
      }
    }

    return allPlatforms.map(platform => {
      const latestVal = latestValuationMap.get(platform.id);
      const totalInvested = allInvestments
        .filter(inv => inv.platformId === platform.id)
        .reduce((sum, inv) => sum + Number(inv.amount), 0);
      
      const response: PlatformResponse = {
        ...platform,
        currentValue: latestVal ? Number(latestVal.value) : 0,
        totalInvested: Number(totalInvested),
        lastValuationDate: latestVal ? latestVal.date : null,
      };
      return response;
    });
  }

  async getPlatform(id: number): Promise<PlatformResponse | undefined> {
    const [platform] = await db.select().from(platforms).where(eq(platforms.id, id));
    if (!platform) return undefined;

    const [latestValuation] = await db
      .select()
      .from(valuations)
      .where(eq(valuations.platformId, id))
      .orderBy(desc(valuations.date))
      .limit(1);

    const allInvestments = await db.select().from(investments).where(eq(investments.platformId, id));
    const totalInvested = allInvestments.reduce((sum, inv) => sum + Number(inv.amount), 0);

    const response: PlatformResponse = {
      ...platform,
      currentValue: latestValuation ? Number(latestValuation.value) : 0,
      totalInvested: Number(totalInvested),
      lastValuationDate: latestValuation ? latestValuation.date : null,
    };
    return response;
  }

  async createPlatform(platform: InsertPlatform): Promise<Platform> {
    const [newPlatform] = await db.insert(platforms).values(platform).returning();
    return newPlatform;
  }

  async updatePlatform(id: number, platform: Partial<InsertPlatform>): Promise<Platform> {
    const [updated] = await db.update(platforms)
      .set(platform)
      .where(eq(platforms.id, id))
      .returning();
    if (!updated) throw new Error("Platform not found");
    return updated;
  }

  async deletePlatform(id: number): Promise<void> {
    // Delete all related data first
    const platformAssets = await db.select().from(assets).where(eq(assets.platformId, id));
    for (const asset of platformAssets) {
      await db.delete(assetValuations).where(eq(assetValuations.assetId, asset.id));
    }
    await db.delete(assets).where(eq(assets.platformId, id));
    await db.delete(valuations).where(eq(valuations.platformId, id));
    await db.delete(investments).where(eq(investments.platformId, id));
    await db.delete(platforms).where(eq(platforms.id, id));
  }

  async getInvestments(platformId: number): Promise<Investment[]> {
    return await db.select().from(investments)
      .where(eq(investments.platformId, platformId))
      .orderBy(desc(investments.date));
  }

  async createInvestment(investment: InsertInvestment): Promise<Investment> {
    const [newInvestment] = await db.insert(investments).values(investment).returning();
    return newInvestment;
  }

  async updateInvestment(id: number, investment: Partial<InsertInvestment>): Promise<Investment> {
    const [updated] = await db.update(investments)
      .set(investment)
      .where(eq(investments.id, id))
      .returning();
    if (!updated) throw new Error("Investment not found");
    return updated;
  }

  async getAllInvestments(): Promise<Investment[]> {
    return await db.select().from(investments);
  }

  async getValuations(platformId: number): Promise<Valuation[]> {
    return await db.select().from(valuations)
      .where(eq(valuations.platformId, platformId))
      .orderBy(desc(valuations.date));
  }

  async createValuation(valuation: InsertValuation): Promise<Valuation> {
    const [newValuation] = await db.insert(valuations).values(valuation).returning();
    return newValuation;
  }

  async updateValuation(id: number, valuation: Partial<InsertValuation>): Promise<Valuation> {
    const [updated] = await db.update(valuations)
      .set(valuation)
      .where(eq(valuations.id, id))
      .returning();
    if (!updated) throw new Error("Valuation not found");
    return updated;
  }

  async getLatestValuations(): Promise<Map<number, number>> {
    const allValuations = await db.select().from(valuations).orderBy(desc(valuations.date));
    const latestMap = new Map<number, number>();
    
    for (const val of allValuations) {
      if (!latestMap.has(val.platformId)) {
        latestMap.set(val.platformId, Number(val.value));
      }
    }
    return latestMap;
  }

  // === ASSETS ===
  async getAssets(platformId: number): Promise<AssetResponse[]> {
    const allAssets = await db.select().from(assets)
      .where(eq(assets.platformId, platformId))
      .orderBy(desc(assets.acquisitionDate));
    
    const allAssetValuations = await db.select().from(assetValuations)
      .orderBy(desc(assetValuations.date));
    
    const latestValuationMap = new Map<number, number>();
    for (const val of allAssetValuations) {
      if (!latestValuationMap.has(val.assetId)) {
        latestValuationMap.set(val.assetId, Number(val.value));
      }
    }

    const now = Date.now();
    return allAssets.map(asset => {
      const latestVal = latestValuationMap.get(asset.id);
      const userInvested = Number(asset.investedAmount);
      const bonus = Number(asset.bonusAmount || 0);
      const totalInvested = userInvested + bonus; // Total working capital
      let currentValue: number;
      let profitLoss: number | undefined;
      let effectiveStatus = asset.status;
      
      // Check if asset has matured (exit date passed but no exit price set)
      const isMatured = asset.exitDate && new Date(asset.exitDate).getTime() <= now && asset.status === "active" && !asset.exitPrice;
      
      if (asset.status === "exited" && asset.exitPrice) {
        currentValue = Number(asset.exitPrice);
        // Profit is exit value minus user's own investment (bonus is free money, counts as profit)
        profitLoss = currentValue - userInvested;
      } else if (isMatured && asset.annualYield && asset.acquisitionDate) {
        // Calculate full term yield for matured assets
        const acquisitionTime = new Date(asset.acquisitionDate).getTime();
        const exitTime = new Date(asset.exitDate!).getTime();
        const yearsElapsed = (exitTime - acquisitionTime) / (365 * 24 * 60 * 60 * 1000);
        const accumulatedYield = totalInvested * (Number(asset.annualYield) / 100) * yearsElapsed;
        currentValue = totalInvested + accumulatedYield;
        profitLoss = accumulatedYield;
        effectiveStatus = "matured";
      } else if (latestVal !== undefined) {
        currentValue = latestVal;
        profitLoss = currentValue - totalInvested;
      } else if (asset.annualYield && asset.acquisitionDate) {
        const yearsElapsed = (now - new Date(asset.acquisitionDate).getTime()) / (365 * 24 * 60 * 60 * 1000);
        const accumulatedYield = totalInvested * (Number(asset.annualYield) / 100) * yearsElapsed;
        currentValue = totalInvested + accumulatedYield;
        profitLoss = accumulatedYield;
      } else {
        currentValue = totalInvested;
      }
      
      return {
        ...asset,
        status: effectiveStatus,
        currentValue: Math.round(currentValue * 100) / 100,
        profitLoss: profitLoss !== undefined ? Math.round(profitLoss * 100) / 100 : undefined
      };
    });
  }

  async getAsset(id: number): Promise<AssetResponse | undefined> {
    const [asset] = await db.select().from(assets).where(eq(assets.id, id));
    if (!asset) return undefined;

    const [latestValuation] = await db.select().from(assetValuations)
      .where(eq(assetValuations.assetId, id))
      .orderBy(desc(assetValuations.date))
      .limit(1);

    const userInvested = Number(asset.investedAmount);
    const bonus = Number(asset.bonusAmount || 0);
    const totalInvested = userInvested + bonus;
    let currentValue: number;
    let profitLoss: number | undefined;

    if (asset.status === "exited" && asset.exitPrice) {
      currentValue = Number(asset.exitPrice);
      // Profit is exit value minus user's own investment (bonus is free money, counts as profit)
      profitLoss = currentValue - userInvested;
    } else if (latestValuation) {
      currentValue = Number(latestValuation.value);
      profitLoss = currentValue - totalInvested;
    } else if (asset.annualYield && asset.acquisitionDate) {
      const yearsElapsed = (Date.now() - new Date(asset.acquisitionDate).getTime()) / (365 * 24 * 60 * 60 * 1000);
      const accumulatedYield = totalInvested * (Number(asset.annualYield) / 100) * yearsElapsed;
      currentValue = totalInvested + accumulatedYield;
      profitLoss = accumulatedYield;
    } else {
      currentValue = totalInvested;
    }

    return {
      ...asset,
      currentValue: Math.round(currentValue * 100) / 100,
      profitLoss: profitLoss !== undefined ? Math.round(profitLoss * 100) / 100 : undefined
    };
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
    const [newAsset] = await db.insert(assets).values(asset).returning();
    return newAsset;
  }

  async updateAsset(id: number, asset: Partial<InsertAsset>): Promise<Asset> {
    const [updated] = await db.update(assets)
      .set(asset)
      .where(eq(assets.id, id))
      .returning();
    if (!updated) throw new Error("Asset not found");
    return updated;
  }

  async deleteAsset(id: number): Promise<void> {
    await db.delete(assetValuations).where(eq(assetValuations.assetId, id));
    await db.delete(assets).where(eq(assets.id, id));
  }

  async exitAsset(id: number, exitDate: Date, exitPrice: string): Promise<Asset> {
    const [updated] = await db.update(assets)
      .set({
        status: "exited",
        exitDate,
        exitPrice
      })
      .where(eq(assets.id, id))
      .returning();
    if (!updated) throw new Error("Asset not found");
    return updated;
  }

  // === ASSET VALUATIONS ===
  async getAssetValuations(assetId: number): Promise<AssetValuation[]> {
    return await db.select().from(assetValuations)
      .where(eq(assetValuations.assetId, assetId))
      .orderBy(desc(assetValuations.date));
  }

  async createAssetValuation(valuation: InsertAssetValuation): Promise<AssetValuation> {
    const [newValuation] = await db.insert(assetValuations).values(valuation).returning();
    return newValuation;
  }

  async updateAssetValuation(id: number, valuation: Partial<InsertAssetValuation>): Promise<AssetValuation> {
    const [updated] = await db.update(assetValuations)
      .set(valuation)
      .where(eq(assetValuations.id, id))
      .returning();
    if (!updated) throw new Error("Asset valuation not found");
    return updated;
  }

  async getAssetPerformanceHistory(platformId: number): Promise<{ date: string; assets: { id: number; name: string; value: number }[] }[]> {
    // Get platform to determine mode
    const [platform] = await db.select().from(platforms).where(eq(platforms.id, platformId));
    if (!platform) return [];

    const allAssets = await db.select().from(assets)
      .where(eq(assets.platformId, platformId))
      .orderBy(desc(assets.acquisitionDate));
    
    if (allAssets.length === 0) return [];

    // Get all valuations for item_valuations mode
    const allValuations: Record<number, { date: Date; value: string }[]> = {};
    if (platform.platformMode === "item_valuations") {
      for (const asset of allAssets) {
        const vals = await db.select().from(assetValuations)
          .where(eq(assetValuations.assetId, asset.id))
          .orderBy(assetValuations.date);
        allValuations[asset.id] = vals.map(v => ({ date: v.date, value: v.value }));
      }
    }

    // Find date range: earliest acquisition to today
    const now = new Date();
    const earliestDate = allAssets.reduce((min, a) => {
      const d = new Date(a.acquisitionDate);
      return d < min ? d : min;
    }, now);

    // Generate monthly data points
    const dataPoints: { date: string; assets: { id: number; name: string; value: number }[] }[] = [];
    const currentDate = new Date(earliestDate);
    currentDate.setDate(1); // Start from first of month

    while (currentDate <= now) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dateTime = currentDate.getTime();
      
      const assetValues = allAssets.map(asset => {
        const acquisitionTime = new Date(asset.acquisitionDate).getTime();
        const exitTime = asset.exitDate ? new Date(asset.exitDate).getTime() : null;
        const userInvested = Number(asset.investedAmount);
        const bonus = Number(asset.bonusAmount || 0);
        const totalInvested = userInvested + bonus;
        
        let value = 0;
        
        // Asset not yet acquired at this date
        if (dateTime < acquisitionTime) {
          value = 0;
        }
        // For item_valuations mode, use recorded valuations
        else if (platform.platformMode === "item_valuations") {
          const vals = allValuations[asset.id] || [];
          // Find the most recent valuation on or before this date
          const relevantVals = vals.filter(v => new Date(v.date).getTime() <= dateTime);
          if (relevantVals.length > 0) {
            value = Number(relevantVals[relevantVals.length - 1].value);
          } else {
            value = totalInvested; // Use total invested if no valuation yet
          }
          // If exited with a price, use that after exit date
          if (exitTime && dateTime >= exitTime && asset.exitPrice) {
            value = Number(asset.exitPrice);
          }
        }
        // For asset_returns mode, calculate using yield
        else {
          const annualYield = asset.annualYield ? Number(asset.annualYield) : 0;
          
          // Asset has exited with explicit price
          if (exitTime && dateTime >= exitTime && asset.exitPrice) {
            value = Number(asset.exitPrice);
          }
          // Asset has exited/matured - calculate full term yield
          else if (exitTime && dateTime >= exitTime) {
            const yearsElapsed = (exitTime - acquisitionTime) / (365 * 24 * 60 * 60 * 1000);
            value = totalInvested + (totalInvested * (annualYield / 100) * yearsElapsed);
          }
          // Asset is active at this date - calculate yield up to this point
          else {
            const yearsElapsed = (dateTime - acquisitionTime) / (365 * 24 * 60 * 60 * 1000);
            value = totalInvested + (totalInvested * (annualYield / 100) * yearsElapsed);
          }
        }
        
        return {
          id: asset.id,
          name: asset.name,
          key: `${asset.name} #${asset.id}`,
          value: Math.round(value * 100) / 100
        };
      });

      dataPoints.push({
        date: dateStr,
        assets: assetValues.filter(a => a.value > 0)
      });

      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return dataPoints;
  }
}

export const storage = new DatabaseStorage();
