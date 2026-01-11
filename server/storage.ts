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
  exitAsset(id: number, exitDate: Date, exitPrice: string): Promise<Asset>;

  // Asset Valuations
  getAssetValuations(assetId: number): Promise<AssetValuation[]>;
  createAssetValuation(valuation: InsertAssetValuation): Promise<AssetValuation>;
  updateAssetValuation(id: number, valuation: Partial<InsertAssetValuation>): Promise<AssetValuation>;
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

    return allAssets.map(asset => {
      const latestVal = latestValuationMap.get(asset.id);
      const investedAmount = Number(asset.investedAmount);
      let currentValue: number;
      let profitLoss: number | undefined;
      
      if (asset.status === "exited" && asset.exitPrice) {
        currentValue = Number(asset.exitPrice);
        profitLoss = currentValue - investedAmount;
      } else if (latestVal !== undefined) {
        currentValue = latestVal;
        profitLoss = currentValue - investedAmount;
      } else if (asset.annualYield && asset.acquisitionDate) {
        const yearsElapsed = (Date.now() - new Date(asset.acquisitionDate).getTime()) / (365 * 24 * 60 * 60 * 1000);
        const accumulatedYield = investedAmount * (Number(asset.annualYield) / 100) * yearsElapsed;
        currentValue = investedAmount + accumulatedYield;
        profitLoss = accumulatedYield;
      } else {
        currentValue = investedAmount;
      }
      
      return {
        ...asset,
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

    const investedAmount = Number(asset.investedAmount);
    let currentValue: number;
    let profitLoss: number | undefined;

    if (asset.status === "exited" && asset.exitPrice) {
      currentValue = Number(asset.exitPrice);
      profitLoss = currentValue - investedAmount;
    } else if (latestValuation) {
      currentValue = Number(latestValuation.value);
      profitLoss = currentValue - investedAmount;
    } else if (asset.annualYield && asset.acquisitionDate) {
      const yearsElapsed = (Date.now() - new Date(asset.acquisitionDate).getTime()) / (365 * 24 * 60 * 60 * 1000);
      const accumulatedYield = investedAmount * (Number(asset.annualYield) / 100) * yearsElapsed;
      currentValue = investedAmount + accumulatedYield;
      profitLoss = accumulatedYield;
    } else {
      currentValue = investedAmount;
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
}

export const storage = new DatabaseStorage();
