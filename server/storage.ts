import { db } from "./db";
import {
  platforms,
  investments,
  withdrawals,
  valuations,
  assets,
  assetValuations,
  assetRepayments,
  emailSettings,
  emailImports,
  type Platform,
  type InsertPlatform,
  type Investment,
  type InsertInvestment,
  type Withdrawal,
  type InsertWithdrawal,
  type Valuation,
  type InsertValuation,
  type Asset,
  type InsertAsset,
  type AssetValuation,
  type InsertAssetValuation,
  type AssetRepayment,
  type InsertAssetRepayment,
  type PlatformResponse,
  type AssetResponse,
  type EmailSettings,
  type InsertEmailSettings,
  type EmailImport,
  type InsertEmailImport,
  scraperConfigs,
  type ScraperConfig,
  type InsertScraperConfig,
  trading212Holdings,
  type Trading212Holding,
  type InsertTrading212Holding,
  trading212Dividends,
  type Trading212Dividend,
  type InsertTrading212Dividend
} from "@shared/schema";
import { eq, desc, sql, and, or } from "drizzle-orm";

export interface IStorage {
  // Ownership verification
  verifyPlatformOwnership(platformId: number, userId: number): Promise<boolean>;
  verifyAssetOwnership(assetId: number, userId: number): Promise<boolean>;
  
  // Platforms
  getPlatforms(userId: number): Promise<PlatformResponse[]>;
  getPlatform(id: number, userId: number): Promise<PlatformResponse | undefined>;
  createPlatform(platform: InsertPlatform, userId: number): Promise<Platform>;
  updatePlatform(id: number, platform: Partial<InsertPlatform>, userId: number): Promise<Platform>;
  deletePlatform(id: number, userId: number): Promise<void>;

  // Investments (require platform ownership verification in routes)
  getInvestments(platformId: number): Promise<Investment[]>;
  getAllInvestmentsForUser(userId: number): Promise<Investment[]>;
  createInvestment(investment: InsertInvestment): Promise<Investment>;
  updateInvestment(id: number, investment: Partial<InsertInvestment>): Promise<Investment>;
  deleteInvestment(id: number): Promise<void>;
  getInvestmentPlatformId(investmentId: number): Promise<number | null>;

  // Withdrawals (require platform ownership verification in routes)
  getWithdrawals(platformId: number): Promise<Withdrawal[]>;
  getAllWithdrawalsForUser(userId: number): Promise<Withdrawal[]>;
  createWithdrawal(withdrawal: InsertWithdrawal): Promise<Withdrawal>;
  updateWithdrawal(id: number, withdrawal: Partial<InsertWithdrawal>): Promise<Withdrawal>;
  deleteWithdrawal(id: number): Promise<void>;
  getWithdrawalPlatformId(withdrawalId: number): Promise<number | null>;

  // Valuations (require platform ownership verification in routes)
  getValuations(platformId: number): Promise<Valuation[]>;
  getAllValuationsForUser(userId: number): Promise<Valuation[]>;
  createValuation(valuation: InsertValuation): Promise<Valuation>;
  updateValuation(id: number, valuation: Partial<InsertValuation>): Promise<Valuation>;
  deleteValuation(id: number): Promise<void>;
  getValuationPlatformId(valuationId: number): Promise<number | null>;

  // Assets (require platform ownership verification in routes)
  getAssets(platformId: number): Promise<AssetResponse[]>;
  getAsset(id: number): Promise<AssetResponse | undefined>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  updateAsset(id: number, asset: Partial<InsertAsset>): Promise<Asset>;
  deleteAsset(id: number): Promise<void>;
  exitAsset(id: number, exitDate: Date, exitPrice: string): Promise<Asset>;
  getAssetPlatformId(assetId: number): Promise<number | null>;

  // Asset Valuations (require asset ownership verification in routes)
  getAssetValuations(assetId: number): Promise<AssetValuation[]>;
  createAssetValuation(valuation: InsertAssetValuation): Promise<AssetValuation>;
  updateAssetValuation(id: number, valuation: Partial<InsertAssetValuation>): Promise<AssetValuation>;
  deleteAssetValuation(id: number): Promise<void>;
  getAssetValuationAssetId(valuationId: number): Promise<number | null>;

  // Asset Repayments (partial principal repayments)
  getAssetRepayments(assetId: number): Promise<AssetRepayment[]>;
  createAssetRepayment(repayment: InsertAssetRepayment): Promise<AssetRepayment>;
  updateAssetRepayment(id: number, data: { amount?: string; date?: Date; notes?: string | null }): Promise<AssetRepayment>;
  deleteAssetRepayment(id: number): Promise<void>;
  getAssetRepaymentAssetId(repaymentId: number): Promise<number | null>;

  // Asset Performance History
  getAssetPerformanceHistory(platformId: number): Promise<{ date: string; assets: { id: number; name: string; key: string; value: number }[] }[]>;

  // Item Bubble Chart Data
  getItemReturnBubbles(platformId: number, statusFilter?: string): Promise<{ assetId: number; assetName: string; date: string; weeksFromInvestment: number; percentReturn: number; investedBasis: number; currentValue: number }[]>;
  
  // Item Cohort Returns
  getItemCohortReturns(platformId: number, statusFilter?: string): Promise<{ cohortKey: string; cohortLabel: string; data: { calendarMonth: string; calendarLabel: string; avgReturn: number; assetCount: number }[] }[]>;

  // Email Settings
  getEmailSettings(userId: number): Promise<EmailSettings | undefined>;
  saveEmailSettings(userId: number, settings: Partial<InsertEmailSettings>): Promise<EmailSettings>;
  deleteEmailSettings(userId: number): Promise<void>;

  // Email Imports
  getPendingEmailImports(userId: number): Promise<EmailImport[]>;
  getEmailImport(id: number, userId: number): Promise<EmailImport | undefined>;
  updateEmailImport(id: number, userId: number, data: Partial<EmailImport>): Promise<EmailImport>;
  dismissEmailImport(id: number, userId: number): Promise<void>;
  approveEmailImport(id: number, userId: number): Promise<void>;

  // Scraper Configs
  getScraperConfig(platformId: number, userId: number): Promise<ScraperConfig | undefined>;
  getScraperConfigsByUser(userId: number): Promise<ScraperConfig[]>;
  getAllEnabledScraperConfigs(): Promise<ScraperConfig[]>;
  saveScraperConfig(config: InsertScraperConfig): Promise<ScraperConfig>;
  updateScraperConfig(id: number, userId: number, data: Partial<ScraperConfig>): Promise<ScraperConfig>;
  deleteScraperConfig(platformId: number, userId: number): Promise<void>;

  // Trading 212 Holdings Snapshots
  saveTrading212Holdings(platformId: number, userId: number, date: Date, holdings: Omit<InsertTrading212Holding, 'platformId' | 'userId' | 'date'>[]): Promise<void>;
  getTrading212Holdings(platformId: number, userId: number): Promise<Trading212Holding[]>;
  getTrading212HoldingsDates(platformId: number, userId: number): Promise<string[]>;
  getTrading212HoldingsByDate(platformId: number, userId: number, date: string): Promise<Trading212Holding[]>;

  // Trading 212 Dividends
  saveTrading212Dividends(platformId: number, userId: number, dividends: { ticker: string; amount: string; paidOn: string; quantity?: string | null }[]): Promise<void>;
  getTrading212Dividends(platformId: number, userId: number): Promise<Trading212Dividend[]>;
}

export class DatabaseStorage implements IStorage {
  // Ownership verification methods
  async verifyPlatformOwnership(platformId: number, userId: number): Promise<boolean> {
    const [platform] = await db.select({ id: platforms.id })
      .from(platforms)
      .where(and(eq(platforms.id, platformId), eq(platforms.userId, userId)));
    return !!platform;
  }

  async verifyAssetOwnership(assetId: number, userId: number): Promise<boolean> {
    const result = await db.select({ platformId: assets.platformId })
      .from(assets)
      .where(eq(assets.id, assetId))
      .limit(1);
    if (!result.length) return false;
    return this.verifyPlatformOwnership(result[0].platformId, userId);
  }

  async deleteInvestment(id: number): Promise<void> {
    await db.delete(investments).where(eq(investments.id, id));
  }

  async getInvestmentPlatformId(investmentId: number): Promise<number | null> {
    const [investment] = await db.select({ platformId: investments.platformId })
      .from(investments)
      .where(eq(investments.id, investmentId));
    return investment?.platformId ?? null;
  }

  async getValuationPlatformId(valuationId: number): Promise<number | null> {
    const [valuation] = await db.select({ platformId: valuations.platformId })
      .from(valuations)
      .where(eq(valuations.id, valuationId));
    return valuation?.platformId ?? null;
  }

  async getAssetPlatformId(assetId: number): Promise<number | null> {
    const [asset] = await db.select({ platformId: assets.platformId })
      .from(assets)
      .where(eq(assets.id, assetId));
    return asset?.platformId ?? null;
  }

  async getAssetValuationAssetId(valuationId: number): Promise<number | null> {
    const [valuation] = await db.select({ assetId: assetValuations.assetId })
      .from(assetValuations)
      .where(eq(assetValuations.id, valuationId));
    return valuation?.assetId ?? null;
  }

  async getPlatforms(userId: number): Promise<PlatformResponse[]> {
    const result = await db.execute(sql`
      SELECT 
        p.*,
        COALESCE(lv.value, 0) as current_value,
        COALESCE(inv_totals.total_invested, 0) as total_invested,
        COALESCE(wd_totals.total_withdrawn, 0) as total_withdrawn,
        lv.date as last_valuation_date
      FROM platforms p
      LEFT JOIN LATERAL (
        SELECT v.value, v.date 
        FROM valuations v 
        WHERE v.platform_id = p.id 
        ORDER BY v.date DESC 
        LIMIT 1
      ) lv ON true
      LEFT JOIN (
        SELECT platform_id, SUM(amount::numeric) as total_invested 
        FROM investments 
        GROUP BY platform_id
      ) inv_totals ON inv_totals.platform_id = p.id
      LEFT JOIN (
        SELECT platform_id, SUM(amount::numeric) as total_withdrawn 
        FROM withdrawals 
        GROUP BY platform_id
      ) wd_totals ON wd_totals.platform_id = p.id
      WHERE p.user_id = ${userId}
      ORDER BY p.name
    `);

    return result.rows.map((row: any) => {
      const totalInvested = Number(row.total_invested) || 0;
      const totalWithdrawn = Number(row.total_withdrawn) || 0;
      return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        category: row.category,
        color: row.color,
        icon: row.icon,
        customIconUrl: row.custom_icon_url,
        description: row.description,
        currency: row.currency,
        platformMode: row.platform_mode,
        createdAt: row.created_at,
        currentValue: Number(row.current_value) || 0,
        totalInvested: totalInvested - totalWithdrawn,
        totalWithdrawn: totalWithdrawn,
        lastValuationDate: row.last_valuation_date || null,
      };
    });
  }

  async getPlatform(id: number, userId: number): Promise<PlatformResponse | undefined> {
    const result = await db.execute(sql`
      SELECT 
        p.*,
        COALESCE(lv.value, 0) as current_value,
        COALESCE(inv_totals.total_invested, 0) as total_invested,
        COALESCE(wd_totals.total_withdrawn, 0) as total_withdrawn,
        lv.date as last_valuation_date
      FROM platforms p
      LEFT JOIN LATERAL (
        SELECT v.value, v.date 
        FROM valuations v 
        WHERE v.platform_id = p.id 
        ORDER BY v.date DESC 
        LIMIT 1
      ) lv ON true
      LEFT JOIN (
        SELECT platform_id, SUM(amount::numeric) as total_invested 
        FROM investments 
        WHERE platform_id = ${id}
        GROUP BY platform_id
      ) inv_totals ON inv_totals.platform_id = p.id
      LEFT JOIN (
        SELECT platform_id, SUM(amount::numeric) as total_withdrawn 
        FROM withdrawals 
        WHERE platform_id = ${id}
        GROUP BY platform_id
      ) wd_totals ON wd_totals.platform_id = p.id
      WHERE p.id = ${id} AND p.user_id = ${userId}
    `);

    if (result.rows.length === 0) return undefined;
    
    const row: any = result.rows[0];
    const totalInvested = Number(row.total_invested) || 0;
    const totalWithdrawn = Number(row.total_withdrawn) || 0;
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      category: row.category,
      color: row.color,
      icon: row.icon,
      customIconUrl: row.custom_icon_url,
      description: row.description,
      currency: row.currency,
      platformMode: row.platform_mode,
      createdAt: row.created_at,
      currentValue: Number(row.current_value) || 0,
      totalInvested: totalInvested - totalWithdrawn,
      totalWithdrawn: totalWithdrawn,
      lastValuationDate: row.last_valuation_date || null,
    };
  }

  async createPlatform(platform: InsertPlatform, userId: number): Promise<Platform> {
    const [newPlatform] = await db.insert(platforms).values({ ...platform, userId }).returning();
    return newPlatform;
  }

  async updatePlatform(id: number, platform: Partial<InsertPlatform>, userId: number): Promise<Platform> {
    const [updated] = await db.update(platforms)
      .set(platform)
      .where(and(eq(platforms.id, id), eq(platforms.userId, userId)))
      .returning();
    if (!updated) throw new Error("Platform not found");
    return updated;
  }

  async deletePlatform(id: number, userId: number): Promise<void> {
    // First verify ownership
    const isOwner = await this.verifyPlatformOwnership(id, userId);
    if (!isOwner) throw new Error("Platform not found");
    
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

  async getAllInvestmentsForUser(userId: number): Promise<Investment[]> {
    const result = await db.select({
      id: investments.id,
      platformId: investments.platformId,
      amount: investments.amount,
      bonusAmount: investments.bonusAmount,
      date: investments.date,
      notes: investments.notes,
      createdAt: investments.createdAt,
    })
      .from(investments)
      .innerJoin(platforms, eq(investments.platformId, platforms.id))
      .where(eq(platforms.userId, userId))
      .orderBy(desc(investments.date));
    
    return result;
  }

  // Withdrawal methods
  async getWithdrawals(platformId: number): Promise<Withdrawal[]> {
    return await db.select()
      .from(withdrawals)
      .where(eq(withdrawals.platformId, platformId))
      .orderBy(desc(withdrawals.date));
  }

  async getAllWithdrawalsForUser(userId: number): Promise<Withdrawal[]> {
    const result = await db.select({
      id: withdrawals.id,
      platformId: withdrawals.platformId,
      amount: withdrawals.amount,
      date: withdrawals.date,
      notes: withdrawals.notes,
      createdAt: withdrawals.createdAt,
    })
      .from(withdrawals)
      .innerJoin(platforms, eq(withdrawals.platformId, platforms.id))
      .where(eq(platforms.userId, userId))
      .orderBy(desc(withdrawals.date));
    
    return result;
  }

  async createWithdrawal(withdrawal: InsertWithdrawal): Promise<Withdrawal> {
    const [newWithdrawal] = await db.insert(withdrawals).values(withdrawal).returning();
    return newWithdrawal;
  }

  async updateWithdrawal(id: number, withdrawal: Partial<InsertWithdrawal>): Promise<Withdrawal> {
    const [updated] = await db.update(withdrawals)
      .set(withdrawal)
      .where(eq(withdrawals.id, id))
      .returning();
    if (!updated) throw new Error("Withdrawal not found");
    return updated;
  }

  async deleteWithdrawal(id: number): Promise<void> {
    await db.delete(withdrawals).where(eq(withdrawals.id, id));
  }

  async getWithdrawalPlatformId(withdrawalId: number): Promise<number | null> {
    const [withdrawal] = await db.select({ platformId: withdrawals.platformId })
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId));
    return withdrawal?.platformId ?? null;
  }

  async getAllValuationsForUser(userId: number): Promise<Valuation[]> {
    const result = await db.select({
      id: valuations.id,
      platformId: valuations.platformId,
      value: valuations.value,
      date: valuations.date,
      createdAt: valuations.createdAt,
    })
      .from(valuations)
      .innerJoin(platforms, eq(valuations.platformId, platforms.id))
      .where(eq(platforms.userId, userId))
      .orderBy(desc(valuations.date));
    
    return result;
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

  async deleteValuation(id: number): Promise<void> {
    await db.delete(valuations).where(eq(valuations.id, id));
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
    
    // Only get asset valuations for assets belonging to this platform (SQL-level filtering)
    const assetIds = allAssets.map(a => a.id);
    if (assetIds.length === 0) return [];
    
    const platformAssetValuations = await db.select({
      id: assetValuations.id,
      assetId: assetValuations.assetId,
      value: assetValuations.value,
      date: assetValuations.date,
      notes: assetValuations.notes,
    })
      .from(assetValuations)
      .innerJoin(assets, eq(assetValuations.assetId, assets.id))
      .where(eq(assets.platformId, platformId))
      .orderBy(desc(assetValuations.date));
    
    // Get total repayments per asset
    const platformRepayments = await db.select({
      assetId: assetRepayments.assetId,
      amount: assetRepayments.amount,
    })
      .from(assetRepayments)
      .innerJoin(assets, eq(assetRepayments.assetId, assets.id))
      .where(eq(assets.platformId, platformId));
    
    const repaymentTotals = new Map<number, number>();
    for (const row of platformRepayments) {
      const current = repaymentTotals.get(row.assetId) || 0;
      repaymentTotals.set(row.assetId, current + Number(row.amount));
    }
    
    const latestValuationMap = new Map<number, number>();
    for (const row of platformAssetValuations) {
      if (!latestValuationMap.has(row.assetId)) {
        latestValuationMap.set(row.assetId, Number(row.value));
      }
    }

    const now = Date.now();
    return allAssets.map(asset => {
      const latestVal = latestValuationMap.get(asset.id);
      const userInvested = Number(asset.investedAmount);
      const bonus = Number(asset.bonusAmount || 0);
      const totalInvested = userInvested + bonus; // Total working capital
      const totalRepaid = repaymentTotals.get(asset.id) || 0;
      const remainingPrincipal = Math.max(0, userInvested - totalRepaid);
      const workingCapital = remainingPrincipal + bonus; // Current working capital after repayments
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
        // Use original invested amount to calculate historical yield (repayments don't reduce past yield earned)
        const acquisitionTime = new Date(asset.acquisitionDate).getTime();
        const exitTime = new Date(asset.exitDate!).getTime();
        const yearsElapsed = (exitTime - acquisitionTime) / (365 * 24 * 60 * 60 * 1000);
        const accumulatedYield = totalInvested * (Number(asset.annualYield) / 100) * yearsElapsed;
        currentValue = workingCapital + accumulatedYield;
        profitLoss = accumulatedYield; // Profit is only the yield earned (repayments are return of capital, not profit)
        effectiveStatus = "matured";
      } else if (latestVal !== undefined) {
        currentValue = latestVal;
        profitLoss = currentValue - workingCapital;
      } else if (asset.annualYield && asset.acquisitionDate) {
        // Calculate yield on remaining principal (after repayments)
        const yearsElapsed = (now - new Date(asset.acquisitionDate).getTime()) / (365 * 24 * 60 * 60 * 1000);
        const accumulatedYield = workingCapital * (Number(asset.annualYield) / 100) * yearsElapsed;
        currentValue = workingCapital + accumulatedYield;
        profitLoss = accumulatedYield;
      } else {
        currentValue = workingCapital;
      }
      
      return {
        ...asset,
        status: effectiveStatus,
        currentValue: Math.round(currentValue * 100) / 100,
        profitLoss: profitLoss !== undefined ? Math.round(profitLoss * 100) / 100 : undefined,
        totalRepaid: totalRepaid > 0 ? Math.round(totalRepaid * 100) / 100 : undefined,
        remainingPrincipal: totalRepaid > 0 ? Math.round(remainingPrincipal * 100) / 100 : undefined
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
    await db.delete(assetRepayments).where(eq(assetRepayments.assetId, id));
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

  async deleteAssetValuation(id: number): Promise<void> {
    await db.delete(assetValuations).where(eq(assetValuations.id, id));
  }

  // === ASSET REPAYMENTS ===
  async getAssetRepayments(assetId: number): Promise<AssetRepayment[]> {
    return await db.select().from(assetRepayments)
      .where(eq(assetRepayments.assetId, assetId))
      .orderBy(desc(assetRepayments.date));
  }

  async createAssetRepayment(repayment: InsertAssetRepayment): Promise<AssetRepayment> {
    const [newRepayment] = await db.insert(assetRepayments).values(repayment).returning();
    return newRepayment;
  }

  async updateAssetRepayment(id: number, data: { amount?: string; date?: Date; notes?: string | null }): Promise<AssetRepayment> {
    const [updated] = await db.update(assetRepayments)
      .set(data)
      .where(eq(assetRepayments.id, id))
      .returning();
    return updated;
  }

  async deleteAssetRepayment(id: number): Promise<void> {
    await db.delete(assetRepayments).where(eq(assetRepayments.id, id));
  }

  async getAssetRepaymentAssetId(repaymentId: number): Promise<number | null> {
    const [repayment] = await db.select({ assetId: assetRepayments.assetId })
      .from(assetRepayments)
      .where(eq(assetRepayments.id, repaymentId));
    return repayment?.assetId ?? null;
  }

  async getAssetPerformanceHistory(platformId: number): Promise<{ date: string; assets: { id: number; name: string; key: string; value: number }[] }[]> {
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
    const dataPoints: { date: string; assets: { id: number; name: string; key: string; value: number }[] }[] = [];
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
        // Exited assets don't count towards current portfolio total after exit
        else if (exitTime && dateTime >= exitTime) {
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
        }
        // For asset_returns mode, calculate using yield
        else {
          const annualYield = asset.annualYield ? Number(asset.annualYield) : 0;
          const yearsElapsed = (dateTime - acquisitionTime) / (365 * 24 * 60 * 60 * 1000);
          value = totalInvested + (totalInvested * (annualYield / 100) * yearsElapsed);
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

    // Always add today as final data point to get most current values
    const todayStr = now.toISOString().split('T')[0];
    const todayTime = now.getTime();
    
    // Only add if last data point isn't already today
    if (dataPoints.length === 0 || dataPoints[dataPoints.length - 1].date !== todayStr) {
      const todayAssetValues = allAssets.map(asset => {
        const acquisitionTime = new Date(asset.acquisitionDate).getTime();
        const exitTime = asset.exitDate ? new Date(asset.exitDate).getTime() : null;
        const userInvested = Number(asset.investedAmount);
        const bonus = Number(asset.bonusAmount || 0);
        const totalInvested = userInvested + bonus;
        
        let value = 0;
        
        if (todayTime < acquisitionTime) {
          value = 0;
        }
        else if (exitTime && todayTime >= exitTime) {
          value = 0;
        }
        else if (platform.platformMode === "item_valuations") {
          const vals = allValuations[asset.id] || [];
          const relevantVals = vals.filter(v => new Date(v.date).getTime() <= todayTime);
          if (relevantVals.length > 0) {
            value = Number(relevantVals[relevantVals.length - 1].value);
          } else {
            value = totalInvested;
          }
        }
        else {
          const annualYield = asset.annualYield ? Number(asset.annualYield) : 0;
          const yearsElapsed = (todayTime - acquisitionTime) / (365 * 24 * 60 * 60 * 1000);
          value = totalInvested + (totalInvested * (annualYield / 100) * yearsElapsed);
        }
        
        return {
          id: asset.id,
          name: asset.name,
          key: `${asset.name} #${asset.id}`,
          value: Math.round(value * 100) / 100
        };
      });

      dataPoints.push({
        date: todayStr,
        assets: todayAssetValues.filter(a => a.value > 0)
      });
    }

    return dataPoints;
  }

  async getItemReturnBubbles(platformId: number, statusFilter: string = "all"): Promise<{ assetId: number; assetName: string; date: string; weeksFromInvestment: number; percentReturn: number; investedBasis: number; currentValue: number; valuationHistory: { date: string; value: number }[] }[]> {
    // Get assets for this platform with optional status filter
    let allAssets;
    if (statusFilter === "active") {
      allAssets = await db.select().from(assets)
        .where(and(eq(assets.platformId, platformId), eq(assets.status, "active")));
    } else if (statusFilter === "exited") {
      allAssets = await db.select().from(assets)
        .where(and(eq(assets.platformId, platformId), or(eq(assets.status, "exited"), eq(assets.status, "matured"))));
    } else {
      allAssets = await db.select().from(assets)
        .where(eq(assets.platformId, platformId));
    }
    
    if (allAssets.length === 0) return [];

    const bubbleData: { assetId: number; assetName: string; date: string; weeksFromInvestment: number; percentReturn: number; investedBasis: number; currentValue: number; valuationHistory: { date: string; value: number }[] }[] = [];

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;

    for (const asset of allAssets) {
      const investedBasis = Number(asset.investedAmount) + Number(asset.bonusAmount || 0);
      
      // Skip if no invested basis (would cause division by zero)
      if (investedBasis <= 0) continue;

      // Get all valuations for this asset ordered by date
      const vals = await db.select().from(assetValuations)
        .where(eq(assetValuations.assetId, asset.id))
        .orderBy(assetValuations.date);

      if (vals.length === 0) continue;

      // Use the asset's acquisition date as the investment date
      const investmentDate = new Date(asset.acquisitionDate);
      
      // Calculate weeks from acquisition date to today (not to valuation date)
      const today = new Date();
      const weeksFromInvestment = Math.round((today.getTime() - investmentDate.getTime()) / msPerWeek * 10) / 10;
      
      // Only use the latest valuation for the value
      const latestVal = vals[vals.length - 1];
      const latestValue = Number(latestVal.value);
      const percentReturn = ((latestValue - investedBasis) / investedBasis) * 100;
      
      // Include valuation history for the mini chart
      const valuationHistory = vals.map(v => ({
        date: v.date.toISOString().split('T')[0],
        value: Number(v.value)
      }));
      
      bubbleData.push({
        assetId: asset.id,
        assetName: asset.name,
        date: latestVal.date.toISOString().split('T')[0],
        weeksFromInvestment,
        percentReturn: Math.round(percentReturn * 100) / 100,
        investedBasis,
        currentValue: latestValue,
        valuationHistory
      });
    }

    // Sort by weeks from investment
    bubbleData.sort((a, b) => a.weeksFromInvestment - b.weeksFromInvestment);

    return bubbleData;
  }

  async getItemCohortReturns(platformId: number, statusFilter: string = "all"): Promise<{ cohortKey: string; cohortLabel: string; data: { calendarMonth: string; calendarLabel: string; avgReturn: number; assetCount: number }[] }[]> {
    let allAssets;
    if (statusFilter === "active") {
      allAssets = await db.select().from(assets)
        .where(and(eq(assets.platformId, platformId), eq(assets.status, "active")));
    } else if (statusFilter === "exited") {
      allAssets = await db.select().from(assets)
        .where(and(eq(assets.platformId, platformId), or(eq(assets.status, "exited"), eq(assets.status, "matured"))));
    } else {
      allAssets = await db.select().from(assets)
        .where(eq(assets.platformId, platformId));
    }
    
    if (allAssets.length === 0) return [];

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Group assets by acquisition calendar month (cohort)
    // For each cohort, track returns at each CALENDAR month (not relative months)
    // Key: cohortKey (YYYY-MM of acquisition), Value: Map<calendarMonth (YYYY-MM), returns[]>
    const cohortData = new Map<string, Map<string, number[]>>();
    const cohortLabels = new Map<string, string>();

    for (const asset of allAssets) {
      const investedBasis = Number(asset.investedAmount) + Number(asset.bonusAmount || 0);
      if (investedBasis <= 0) continue;

      const acquisitionDate = new Date(asset.acquisitionDate);
      const cohortKey = `${acquisitionDate.getFullYear()}-${String(acquisitionDate.getMonth() + 1).padStart(2, '0')}`;
      const cohortLabel = `${monthNames[acquisitionDate.getMonth()]} ${acquisitionDate.getFullYear()}`;
      
      if (!cohortData.has(cohortKey)) {
        cohortData.set(cohortKey, new Map());
        cohortLabels.set(cohortKey, cohortLabel);
      }

      // Get all valuations for this asset
      const vals = await db.select().from(assetValuations)
        .where(eq(assetValuations.assetId, asset.id))
        .orderBy(assetValuations.date);

      if (vals.length === 0) continue;

      // For each valuation, group by the CALENDAR month of the valuation
      // Skip valuations that predate the asset's acquisition
      for (const val of vals) {
        const valDate = new Date(val.date);
        if (valDate < acquisitionDate) continue;
        
        const calendarMonth = `${valDate.getFullYear()}-${String(valDate.getMonth() + 1).padStart(2, '0')}`;

        const valValue = Number(val.value);
        const percentReturn = ((valValue - investedBasis) / investedBasis) * 100;
        
        const cohortMonths = cohortData.get(cohortKey)!;
        if (!cohortMonths.has(calendarMonth)) {
          cohortMonths.set(calendarMonth, []);
        }
        cohortMonths.get(calendarMonth)!.push(percentReturn);
      }
    }

    // Convert to output format - one line per cohort
    const result: { cohortKey: string; cohortLabel: string; data: { calendarMonth: string; calendarLabel: string; avgReturn: number; assetCount: number }[] }[] = [];

    const sortedCohortKeys = Array.from(cohortData.keys()).sort();

    for (const cohortKey of sortedCohortKeys) {
      const monthsMap = cohortData.get(cohortKey)!;
      const sortedCalendarMonths = Array.from(monthsMap.keys()).sort();
      
      const data: { calendarMonth: string; calendarLabel: string; avgReturn: number; assetCount: number }[] = [];
      for (const calendarMonth of sortedCalendarMonths) {
        const returns = monthsMap.get(calendarMonth)!;
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const [year, month] = calendarMonth.split('-');
        const calendarLabel = `${monthNames[parseInt(month) - 1]} ${year}`;
        data.push({
          calendarMonth,
          calendarLabel,
          avgReturn: Math.round(avgReturn * 100) / 100,
          assetCount: returns.length
        });
      }

      if (data.length > 0) {
        result.push({
          cohortKey,
          cohortLabel: cohortLabels.get(cohortKey)!,
          data
        });
      }
    }

    return result;
  }

  // Email Settings
  async getEmailSettings(userId: number): Promise<EmailSettings | undefined> {
    const [settings] = await db.select()
      .from(emailSettings)
      .where(eq(emailSettings.userId, userId))
      .limit(1);
    return settings;
  }

  async saveEmailSettings(userId: number, settings: Partial<InsertEmailSettings>): Promise<EmailSettings> {
    const existing = await this.getEmailSettings(userId);
    
    if (existing) {
      const [updated] = await db.update(emailSettings)
        .set(settings)
        .where(eq(emailSettings.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(emailSettings)
        .values({
          userId,
          imapHost: settings.imapHost || "imap.gmail.com",
          imapPort: settings.imapPort || 993,
          imapUser: settings.imapUser!,
          imapPassword: settings.imapPassword!,
          imapTls: settings.imapTls ?? true,
          enabled: settings.enabled ?? true,
        })
        .returning();
      return created;
    }
  }

  async deleteEmailSettings(userId: number): Promise<void> {
    await db.delete(emailSettings).where(eq(emailSettings.userId, userId));
  }

  // Email Imports
  async getPendingEmailImports(userId: number): Promise<EmailImport[]> {
    return db.select()
      .from(emailImports)
      .where(and(
        eq(emailImports.userId, userId),
        eq(emailImports.status, "pending")
      ))
      .orderBy(desc(emailImports.emailDate));
  }

  async getEmailImport(id: number, userId: number): Promise<EmailImport | undefined> {
    const [result] = await db.select()
      .from(emailImports)
      .where(and(
        eq(emailImports.id, id),
        eq(emailImports.userId, userId)
      ))
      .limit(1);
    return result;
  }

  async updateEmailImport(id: number, userId: number, data: Partial<EmailImport>): Promise<EmailImport> {
    const [updated] = await db.update(emailImports)
      .set(data)
      .where(and(
        eq(emailImports.id, id),
        eq(emailImports.userId, userId)
      ))
      .returning();
    return updated;
  }

  async dismissEmailImport(id: number, userId: number): Promise<void> {
    await db.update(emailImports)
      .set({ status: "dismissed" })
      .where(and(
        eq(emailImports.id, id),
        eq(emailImports.userId, userId)
      ));
  }

  async approveEmailImport(id: number, userId: number): Promise<void> {
    await db.update(emailImports)
      .set({ status: "approved" })
      .where(and(
        eq(emailImports.id, id),
        eq(emailImports.userId, userId)
      ));
  }

  // Scraper Configs
  async getScraperConfig(platformId: number, userId: number): Promise<ScraperConfig | undefined> {
    const [config] = await db.select().from(scraperConfigs)
      .where(and(
        eq(scraperConfigs.platformId, platformId),
        eq(scraperConfigs.userId, userId)
      ));
    return config;
  }

  async getScraperConfigsByUser(userId: number): Promise<ScraperConfig[]> {
    return db.select().from(scraperConfigs)
      .where(eq(scraperConfigs.userId, userId));
  }

  async getAllEnabledScraperConfigs(): Promise<ScraperConfig[]> {
    return db.select().from(scraperConfigs)
      .where(eq(scraperConfigs.enabled, true));
  }

  async saveScraperConfig(config: InsertScraperConfig): Promise<ScraperConfig> {
    const existing = await this.getScraperConfig(config.platformId, config.userId);
    if (existing) {
      const [updated] = await db.update(scraperConfigs)
        .set({ credentials: config.credentials, scraperType: config.scraperType, enabled: config.enabled })
        .where(eq(scraperConfigs.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(scraperConfigs).values(config).returning();
    return created;
  }

  async updateScraperConfig(id: number, userId: number, data: Partial<ScraperConfig>): Promise<ScraperConfig> {
    const [updated] = await db.update(scraperConfigs)
      .set(data)
      .where(and(
        eq(scraperConfigs.id, id),
        eq(scraperConfigs.userId, userId)
      ))
      .returning();
    return updated;
  }

  async deleteScraperConfig(platformId: number, userId: number): Promise<void> {
    await db.delete(scraperConfigs)
      .where(and(
        eq(scraperConfigs.platformId, platformId),
        eq(scraperConfigs.userId, userId)
      ));
  }

  async saveTrading212Holdings(platformId: number, userId: number, date: Date, holdings: Omit<InsertTrading212Holding, 'platformId' | 'userId' | 'date'>[]): Promise<void> {
    const dateStr = date.toISOString().split("T")[0];
    const dayStart = new Date(dateStr + "T00:00:00.000Z");
    const dayEnd = new Date(dateStr + "T23:59:59.999Z");

    await db.delete(trading212Holdings)
      .where(and(
        eq(trading212Holdings.platformId, platformId),
        eq(trading212Holdings.userId, userId),
        sql`${trading212Holdings.date} >= ${dayStart}`,
        sql`${trading212Holdings.date} <= ${dayEnd}`
      ));

    if (holdings.length > 0) {
      const rows = holdings.map(h => ({
        ...h,
        platformId,
        userId,
        date,
      }));
      await db.insert(trading212Holdings).values(rows);
    }
  }

  async getTrading212Holdings(platformId: number, userId: number): Promise<Trading212Holding[]> {
    return await db.select()
      .from(trading212Holdings)
      .where(and(
        eq(trading212Holdings.platformId, platformId),
        eq(trading212Holdings.userId, userId)
      ))
      .orderBy(desc(trading212Holdings.date));
  }

  async getTrading212HoldingsDates(platformId: number, userId: number): Promise<string[]> {
    const results = await db.selectDistinct({ date: sql<string>`DATE(${trading212Holdings.date})` })
      .from(trading212Holdings)
      .where(and(
        eq(trading212Holdings.platformId, platformId),
        eq(trading212Holdings.userId, userId)
      ))
      .orderBy(sql`DATE(${trading212Holdings.date}) DESC`);
    return results.map(r => r.date);
  }

  async getTrading212HoldingsByDate(platformId: number, userId: number, date: string): Promise<Trading212Holding[]> {
    const dayStart = new Date(date + "T00:00:00.000Z");
    const dayEnd = new Date(date + "T23:59:59.999Z");
    return await db.select()
      .from(trading212Holdings)
      .where(and(
        eq(trading212Holdings.platformId, platformId),
        eq(trading212Holdings.userId, userId),
        sql`${trading212Holdings.date} >= ${dayStart}`,
        sql`${trading212Holdings.date} <= ${dayEnd}`
      ))
      .orderBy(desc(trading212Holdings.value));
  }

  async saveTrading212Dividends(platformId: number, userId: number, dividends: { ticker: string; amount: string; paidOn: string; quantity?: string | null }[]): Promise<void> {
    if (dividends.length === 0) return;
    const seen = new Set<string>();
    const unique = dividends.filter(d => {
      const key = `${d.ticker}|${d.paidOn}|${d.amount}|${d.quantity ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await db.transaction(async (tx) => {
      await tx.delete(trading212Dividends)
        .where(and(
          eq(trading212Dividends.platformId, platformId),
          eq(trading212Dividends.userId, userId)
        ));
      const rows = unique.map(d => ({
        platformId,
        userId,
        ticker: d.ticker,
        amount: d.amount,
        paidOn: d.paidOn,
        quantity: d.quantity ?? null,
      }));
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        await tx.insert(trading212Dividends).values(rows.slice(i, i + batchSize));
      }
    });
  }

  async getTrading212Dividends(platformId: number, userId: number): Promise<Trading212Dividend[]> {
    return db.select()
      .from(trading212Dividends)
      .where(and(
        eq(trading212Dividends.platformId, platformId),
        eq(trading212Dividends.userId, userId)
      ))
      .orderBy(trading212Dividends.paidOn);
  }
}

export const storage = new DatabaseStorage();
