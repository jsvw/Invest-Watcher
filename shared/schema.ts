import { pgTable, text, serial, integer, boolean, timestamp, numeric, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
export const platforms = pgTable("platforms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // e.g., 'Crypto', 'Stock', 'Bank', 'Real Estate'
  color: text("color").notNull().default("#3b82f6"), // For chart visualization
  currency: text("currency").notNull().default("USD"), // e.g., 'USD', 'EUR', 'GBP'
  createdAt: timestamp("created_at").defaultNow(),
});

export const investments = pgTable("investments", {
  id: serial("id").primaryKey(),
  platformId: integer("platform_id").notNull().references(() => platforms.id),
  amount: numeric("amount").notNull(), // Stored as numeric for precision, but might need coercion
  date: timestamp("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const valuations = pgTable("valuations", {
  id: serial("id").primaryKey(),
  platformId: integer("platform_id").notNull().references(() => platforms.id),
  value: numeric("value").notNull(),
  date: timestamp("date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === BASE SCHEMAS ===
export const insertPlatformSchema = createInsertSchema(platforms).omit({ id: true, createdAt: true });
export const insertInvestmentSchema = createInsertSchema(investments).omit({ id: true, createdAt: true });
export const insertValuationSchema = createInsertSchema(valuations).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===

// Base types
export type Platform = typeof platforms.$inferSelect;
export type Investment = typeof investments.$inferSelect;
export type Valuation = typeof valuations.$inferSelect;

export type InsertPlatform = z.infer<typeof insertPlatformSchema>;
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type InsertValuation = z.infer<typeof insertValuationSchema>;

// Request types
export type CreatePlatformRequest = InsertPlatform;
export type CreateInvestmentRequest = InsertInvestment;
export type CreateValuationRequest = InsertValuation;
export type UpdatePlatformRequest = Partial<InsertPlatform>;

// Response types
export type PlatformResponse = Platform & {
  currentValue?: number; // Calculated on the fly or fetched from latest valuation
  totalInvested?: number; // Sum of investments
  lastValuationDate?: string | Date | null; // Date of the latest valuation
};

export type DashboardStats = {
  totalValue: number;
  totalInvested: number;
  roi: number; // Return on Investment %
  platforms: PlatformResponse[];
};

export type InsightRequest = {
  prompt?: string;
};

export type InsightResponse = {
  insight: string;
};

export * from "./models/chat";
