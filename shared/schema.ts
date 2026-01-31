import { pgTable, text, serial, integer, boolean, timestamp, numeric, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === PLATFORM MODES ===
// "standard" - Platform-level investments & valuations (current behavior)
// "asset_returns" - Individual assets with invested amount + annual yield (real estate, loans)
// "item_valuations" - Individual items with periodic valuation updates (collectibles, crypto)

// === USERS TABLE ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // bcrypt hashed, never store plain passwords
  name: text("name"),
  currency: text("currency").notNull().default("EUR"), // Default display currency for the account
  createdAt: timestamp("created_at").defaultNow(),
});

// === TABLE DEFINITIONS ===
export const platforms = pgTable("platforms", {
  userId: integer("user_id").references(() => users.id),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // e.g., 'Crypto', 'Stock', 'Bank', 'Real Estate'
  color: text("color").notNull().default("#3b82f6"), // For chart visualization
  icon: text("icon"), // Icon identifier for the platform (e.g., 'binance', 'coinbase', 'bank', etc.)
  customIconUrl: text("custom_icon_url"), // URL for custom uploaded icon image
  currency: text("currency").notNull().default("USD"), // e.g., 'USD', 'EUR', 'GBP'
  platformMode: text("platform_mode").notNull().default("standard"), // 'standard', 'asset_returns', 'item_valuations'
  createdAt: timestamp("created_at").defaultNow(),
});

export const investments = pgTable("investments", {
  id: serial("id").primaryKey(),
  platformId: integer("platform_id").notNull().references(() => platforms.id),
  amount: numeric("amount").notNull(), // Stored as numeric for precision, but might need coercion
  bonusAmount: numeric("bonus_amount"), // Free bonus received on top of investment
  date: timestamp("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  platformId: integer("platform_id").notNull().references(() => platforms.id),
  amount: numeric("amount").notNull(),
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

// === ASSET TRACKING (for asset_returns and item_valuations modes) ===
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  platformId: integer("platform_id").notNull().references(() => platforms.id),
  name: text("name").notNull(),
  description: text("description"),
  investedAmount: numeric("invested_amount").notNull(), // Amount invested by user (or total for item_valuations)
  bonusAmount: numeric("bonus_amount"), // Free bonus received on top of investment
  annualYield: numeric("annual_yield"), // For asset_returns mode: expected annual yield %
  quantity: numeric("quantity"), // For item_valuations mode: number of items
  pricePerUnit: numeric("price_per_unit"), // For item_valuations mode: price per item
  acquisitionDate: timestamp("acquisition_date").notNull(),
  expectedExitDate: timestamp("expected_exit_date"), // Maturity date for the investment
  status: text("status").notNull().default("active"), // 'active' or 'exited'
  exitDate: timestamp("exit_date"), // When the asset was sold
  exitPrice: numeric("exit_price"), // Sale price when exited
  createdAt: timestamp("created_at").defaultNow(),
});

export const assetValuations = pgTable("asset_valuations", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assets.id),
  value: numeric("value").notNull(),
  date: timestamp("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === ASSET REPAYMENTS (partial principal repayments for crowdlending etc) ===
export const assetRepayments = pgTable("asset_repayments", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assets.id),
  amount: numeric("amount").notNull(), // Amount of principal repaid
  date: timestamp("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === EMAIL IMPORT SETTINGS ===
export const emailSettings = pgTable("email_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  imapHost: text("imap_host").notNull().default("imap.gmail.com"),
  imapPort: integer("imap_port").notNull().default(993),
  imapUser: text("imap_user").notNull(), // Email address
  imapPassword: text("imap_password").notNull(), // App password (encrypted in transit)
  imapTls: boolean("imap_tls").notNull().default(true),
  enabled: boolean("enabled").notNull().default(true),
  lastPollAt: timestamp("last_poll_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === EMAIL IMPORTS (pending parsed emails) ===
export const emailImports = pgTable("email_imports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  emailUid: text("email_uid").notNull(), // IMAP UID to prevent duplicates
  emailSubject: text("email_subject"),
  emailFrom: text("email_from"),
  emailDate: timestamp("email_date"),
  emailBody: text("email_body"), // Store for reference
  attachmentContent: text("attachment_content"), // Parsed text from attachments (PDFs, etc.)
  // Parsed fields (from AI)
  transactionType: text("transaction_type"), // 'deposit', 'withdrawal', 'purchase', 'partial_exit', 'full_exit', 'interest'
  parsedPlatformName: text("parsed_platform_name"),
  parsedAssetName: text("parsed_asset_name"),
  parsedAmount: numeric("parsed_amount"),
  parsedDate: timestamp("parsed_date"),
  parsedNotes: text("parsed_notes"),
  // Matching
  matchedPlatformId: integer("matched_platform_id").references(() => platforms.id),
  matchedAssetId: integer("matched_asset_id").references(() => assets.id),
  // Status
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'dismissed', 'error'
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === BASE SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertPlatformSchema = createInsertSchema(platforms).omit({ id: true, createdAt: true });
export const insertInvestmentSchema = createInsertSchema(investments).omit({ id: true, createdAt: true });
export const insertWithdrawalSchema = createInsertSchema(withdrawals).omit({ id: true, createdAt: true });
export const insertValuationSchema = createInsertSchema(valuations).omit({ id: true, createdAt: true });
export const insertAssetSchema = createInsertSchema(assets).omit({ id: true, createdAt: true });
export const insertAssetValuationSchema = createInsertSchema(assetValuations).omit({ id: true, createdAt: true });
export const insertAssetRepaymentSchema = createInsertSchema(assetRepayments).omit({ id: true, createdAt: true });
export const insertEmailSettingsSchema = createInsertSchema(emailSettings).omit({ id: true, createdAt: true, lastPollAt: true });
export const insertEmailImportSchema = createInsertSchema(emailImports).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===

// Base types
export type User = typeof users.$inferSelect;
export type Platform = typeof platforms.$inferSelect;
export type Investment = typeof investments.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type Valuation = typeof valuations.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type AssetValuation = typeof assetValuations.$inferSelect;
export type AssetRepayment = typeof assetRepayments.$inferSelect;
export type EmailSettings = typeof emailSettings.$inferSelect;
export type EmailImport = typeof emailImports.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertPlatform = z.infer<typeof insertPlatformSchema>;
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
export type InsertValuation = z.infer<typeof insertValuationSchema>;
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type InsertAssetValuation = z.infer<typeof insertAssetValuationSchema>;
export type InsertAssetRepayment = z.infer<typeof insertAssetRepaymentSchema>;
export type InsertEmailSettings = z.infer<typeof insertEmailSettingsSchema>;
export type InsertEmailImport = z.infer<typeof insertEmailImportSchema>;

// Request types
export type CreatePlatformRequest = InsertPlatform;
export type CreateInvestmentRequest = InsertInvestment;
export type CreateValuationRequest = InsertValuation;
export type CreateAssetRequest = InsertAsset;
export type CreateAssetValuationRequest = InsertAssetValuation;
export type UpdatePlatformRequest = Partial<InsertPlatform>;
export type UpdateAssetRequest = Partial<InsertAsset>;
export type ExitAssetRequest = { exitDate: string | Date; exitPrice: string };

// Response types
export type PlatformResponse = Platform & {
  currentValue?: number; // Calculated on the fly or fetched from latest valuation
  totalInvested?: number; // Sum of investments minus withdrawals (net invested)
  totalWithdrawn?: number; // Sum of withdrawals
  lastValuationDate?: string | Date | null; // Date of the latest valuation
};

export type AssetResponse = Asset & {
  currentValue?: number; // Latest valuation or invested amount if no valuations
  profitLoss?: number; // For exited assets: exitPrice - investedAmount
  totalRepaid?: number; // Sum of all partial repayments
  remainingPrincipal?: number; // investedAmount - totalRepaid
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
