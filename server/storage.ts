import { db } from "./db";
import {
  platforms,
  investments,
  valuations,
  type Platform,
  type InsertPlatform,
  type Investment,
  type InsertInvestment,
  type Valuation,
  type InsertValuation,
  type PlatformResponse
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
  getAllInvestments(): Promise<Investment[]>; // For aggregate calculations

  // Valuations
  getValuations(platformId: number): Promise<Valuation[]>;
  createValuation(valuation: InsertValuation): Promise<Valuation>;
  getLatestValuations(): Promise<Map<number, number>>; // Map platformId -> value
}

export class DatabaseStorage implements IStorage {
  async getPlatforms(): Promise<PlatformResponse[]> {
    const allPlatforms = await db.select().from(platforms);
    const latestValuations = await this.getLatestValuations();
    const allInvestments = await this.getAllInvestments();

    return allPlatforms.map(platform => {
      const currentVal = latestValuations.get(platform.id) || 0;
      const totalInvested = allInvestments
        .filter(inv => inv.platformId === platform.id)
        .reduce((sum, inv) => sum + Number(inv.amount), 0);
      
      return {
        ...platform,
        currentValue: Number(currentVal),
        totalInvested: Number(totalInvested)
      };
    });
  }

  async getPlatform(id: number): Promise<PlatformResponse | undefined> {
    const [platform] = await db.select().from(platforms).where(eq(platforms.id, id));
    if (!platform) return undefined;

    const latestValuations = await this.getLatestValuations();
    const allInvestments = await this.getAllInvestments();

    const currentVal = latestValuations.get(platform.id) || 0;
    const totalInvested = allInvestments
      .filter(inv => inv.platformId === platform.id)
      .reduce((sum, inv) => sum + Number(inv.amount), 0);

    return {
      ...platform,
      currentValue: Number(currentVal),
      totalInvested: Number(totalInvested)
    };
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

  async getLatestValuations(): Promise<Map<number, number>> {
    // This is a bit complex in SQL, so we'll fetch all and process in memory for simplicity in MVP
    // or use a distinct on query. Let's do a simple query for now.
    // For a robust solution, we'd use a subquery/window function.
    const allValuations = await db.select().from(valuations).orderBy(desc(valuations.date));
    const latestMap = new Map<number, number>();
    
    for (const val of allValuations) {
      if (!latestMap.has(val.platformId)) {
        latestMap.set(val.platformId, Number(val.value));
      }
    }
    return latestMap;
  }
}

export const storage = new DatabaseStorage();
