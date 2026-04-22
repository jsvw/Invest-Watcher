import type { Express, Request } from "express";
import type { Server } from "http";
import { storage, deduplicateSameDayValuations } from "./storage";
import { db } from "./db";
import { valuations, assets, assetValuations, assetRepayments, insertAssetSchema, insertAssetValuationSchema, insertAssetRepaymentSchema } from "@shared/schema";
import { api } from "@shared/routes";
import { eq, desc, and, ilike } from "drizzle-orm";
import { z } from "zod";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import OpenAI from "openai";
import { importInvestmentData } from "./seed_data";
import multer from "multer";
import Papa from "papaparse";
import fs from "fs";
import { setupAuth, requireAuth, getAuthenticatedUserId } from "./auth";
import { encrypt, decrypt } from "./encryption";

const DIVIDEND_START = '2024-07-01';

// --- FMP dividend calendar helpers ---

function normalizeTicker(t212Ticker: string): string {
  // Strip exchange suffix patterns: _US_EQ, _GB_EQ, _DE_EQ, _EQ etc.
  let sym = t212Ticker.replace(/_[A-Z]{1,3}_EQ$/, '').replace(/_EQ$/, '');
  // Convert remaining underscores to dots (e.g. BRK_B → BRK.B for share classes)
  sym = sym.replace(/_/g, '.');
  return sym.toUpperCase();
}

function detectFrequencyFmp(sortedDates: string[]): { label: string; days: number } {
  if (sortedDates.length < 2) return { label: "annual", days: 365 };
  const gaps: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const d1 = new Date(sortedDates[i - 1]).getTime();
    const d2 = new Date(sortedDates[i]).getTime();
    gaps.push((d2 - d1) / 86400000);
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (median >= 25 && median <= 35) return { label: "monthly", days: 30 };
  if (median >= 80 && median <= 100) return { label: "quarterly", days: 91 };
  if (median >= 170 && median <= 200) return { label: "semi-annual", days: 182 };
  return { label: "annual", days: 365 };
}

let _fmpDivCache: { data: Map<string, string[]>; fromKey: string; timestamp: number } | null = null;

async function getFmpDividendCalendar(): Promise<Map<string, string[]>> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return new Map();
  const now = Date.now();
  const from = new Date().toISOString().slice(0, 10);
  if (_fmpDivCache && _fmpDivCache.fromKey === from && now - _fmpDivCache.timestamp < 24 * 60 * 60 * 1000) {
    return _fmpDivCache.data;
  }
  try {
    const toDate = new Date();
    toDate.setMonth(toDate.getMonth() + 6);
    const to = toDate.toISOString().slice(0, 10);
    const url = `https://financialmodelingprep.com/stable/dividends-calendar?from=${from}&to=${to}&apikey=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`[FMP] API error: ${resp.status} ${resp.statusText}`);
      return new Map();
    }
    const items: { symbol?: string; paymentDate?: string }[] = await resp.json();
    const map = new Map<string, string[]>();
    for (const item of items) {
      if (!item.symbol || !item.paymentDate) continue;
      const sym = item.symbol.toUpperCase();
      if (!map.has(sym)) map.set(sym, []);
      map.get(sym)!.push(item.paymentDate);
    }
    _fmpDivCache = { data: map, fromKey: from, timestamp: now };
    console.log(`[FMP] Loaded ${items.length} dividend calendar entries for ${map.size} symbols`);
    return map;
  } catch (err: any) {
    console.error('[FMP] Fetch error:', err.message);
    return new Map();
  }
}

// Configure multer for file uploads
const upload = multer({ dest: "/tmp/uploads/" });

/**
 * Normalize a number string that may use European formatting.
 * European format uses "." as thousands separator and "," as decimal.
 *
 * Only normalizes when the format is unambiguous (comma is present):
 *   "2.596,11"  → "2596.11"  (dot thousands + comma decimal = clear EU format)
 *   "2596,11"   → "2596.11"  (comma only = comma as decimal separator)
 *   "2.596.000,11" → "2596000.11" (multi-group EU format)
 *
 * Leaves ambiguous dot-only strings unchanged:
 *   "2596.11"   → "2596.11"  (standard US format, unchanged)
 *   "2.596"     → "2.596"   (ambiguous — could be decimal 2.596 or EU-thousands 2596)
 *   "4.51"      → "4.51"    (unchanged)
 *   "608.105"   → "608.105"  (unchanged)
 */
function normalizeEuropeanNumber(value: string): string {
  const s = value.trim().replace(/\s/g, "");
  if (!s) return s;

  const hasComma = s.includes(",");

  if (!hasComma) {
    return s;
  }

  const hasDot = s.includes(".");
  if (hasDot && hasComma) {
    const lastDotIdx = s.lastIndexOf(".");
    const lastCommaIdx = s.lastIndexOf(",");
    if (lastCommaIdx > lastDotIdx) {
      return s.replace(/\./g, "").replace(",", ".");
    }
    return s.replace(/,/g, "");
  }

  return s.replace(",", ".");
}

// Initialize OpenAI client for insights
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication (must be before routes)
  setupAuth(app);

  // One-time cleanup: remove duplicate same-day valuations before serving requests
  try {
    await deduplicateSameDayValuations();
  } catch (err) {
    console.error("[startup] deduplicateSameDayValuations failed:", err);
  }

  // Register AI integration routes
  registerChatRoutes(app);
  registerImageRoutes(app);
  
  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);

  // --- Platforms (protected) ---
  app.get(api.platforms.list.path, requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    const platforms = await storage.getPlatforms(userId);
    res.json(platforms);
  });

  app.post(api.platforms.create.path, requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const input = api.platforms.create.input.parse(req.body);
      const platform = await storage.createPlatform(input, userId);
      res.status(201).json(platform);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.platforms.get.path, requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    const platform = await storage.getPlatform(Number(req.params.id), userId);
    if (!platform) {
      return res.status(404).json({ message: 'Platform not found' });
    }
    res.json(platform);
  });

  app.patch('/api/platforms/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platform = await storage.updatePlatform(Number(req.params.id), req.body, userId);
      res.json(platform);
    } catch (err) {
      res.status(404).json({ message: "Platform not found" });
    }
  });

  app.delete('/api/platforms/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      await storage.deletePlatform(Number(req.params.id), userId);
      res.status(204).send();
    } catch (err) {
      res.status(404).json({ message: "Platform not found" });
    }
  });

  // --- Investments ---
  app.get(api.investments.list.path, requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    const platformId = Number(req.params.platformId);
    const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
    if (!isOwner) return res.status(404).json({ message: "Platform not found" });
    
    const investments = await storage.getInvestments(platformId);
    res.json(investments);
  });

  app.post(api.investments.create.path, requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const input = api.investments.create.input.parse(req.body);
      const isOwner = await storage.verifyPlatformOwnership(input.platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });
      
      const investment = await storage.createInvestment(input);
      res.status(201).json(investment);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch('/api/investments/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = await storage.getInvestmentPlatformId(Number(req.params.id));
      if (!platformId) return res.status(404).json({ message: "Investment not found" });
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Investment not found" });
      
      const input = api.investments.update.input.parse(req.body);
      const investment = await storage.updateInvestment(Number(req.params.id), input);
      res.json(investment);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(404).json({ message: "Investment not found" });
    }
  });

  app.delete('/api/investments/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = await storage.getInvestmentPlatformId(Number(req.params.id));
      if (!platformId) return res.status(404).json({ message: "Investment not found" });
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Investment not found" });
      await storage.deleteInvestment(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      res.status(404).json({ message: "Investment not found" });
    }
  });

  // --- Withdrawals ---
  app.get(api.withdrawals.list.path, requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    const platformId = Number(req.params.platformId);
    const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
    if (!isOwner) return res.status(404).json({ message: "Platform not found" });
    
    const withdrawals = await storage.getWithdrawals(platformId);
    res.json(withdrawals);
  });

  app.post(api.withdrawals.create.path, requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const input = api.withdrawals.create.input.parse(req.body);
      const isOwner = await storage.verifyPlatformOwnership(input.platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });
      
      // Create the withdrawal
      const withdrawal = await storage.createWithdrawal(input);
      
      // If currentValue is provided, also create a valuation for the same date
      const currentValue = req.body.currentValue;
      if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
        await storage.createValuation({
          platformId: input.platformId,
          value: String(currentValue),
          date: input.date,
        });
      }
      
      res.status(201).json(withdrawal);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch('/api/withdrawals/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = await storage.getWithdrawalPlatformId(Number(req.params.id));
      if (!platformId) return res.status(404).json({ message: "Withdrawal not found" });
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Withdrawal not found" });
      
      const input = api.withdrawals.update.input.parse(req.body);
      const withdrawal = await storage.updateWithdrawal(Number(req.params.id), input);
      res.json(withdrawal);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(404).json({ message: "Withdrawal not found" });
    }
  });

  app.delete('/api/withdrawals/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = await storage.getWithdrawalPlatformId(Number(req.params.id));
      if (!platformId) return res.status(404).json({ message: "Withdrawal not found" });
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Withdrawal not found" });
      
      await storage.deleteWithdrawal(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      res.status(404).json({ message: "Withdrawal not found" });
    }
  });

  // --- Valuations ---
  app.get(api.valuations.list.path, requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    const platformId = Number(req.params.platformId);
    const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
    if (!isOwner) return res.status(404).json({ message: "Platform not found" });
    
    const valuations = await storage.getValuations(platformId);
    res.json(valuations);
  });

  app.post(api.valuations.create.path, requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const input = api.valuations.create.input.parse(req.body);
      const isOwner = await storage.verifyPlatformOwnership(input.platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });
      
      const valuation = await storage.createValuation(input);
      res.status(201).json(valuation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch('/api/valuations/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = await storage.getValuationPlatformId(Number(req.params.id));
      if (!platformId) return res.status(404).json({ message: "Valuation not found" });
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Valuation not found" });
      
      const input = api.valuations.update.input.parse(req.body);
      const valuation = await storage.updateValuation(Number(req.params.id), input);
      res.json(valuation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(404).json({ message: "Valuation not found" });
    }
  });

  app.delete('/api/valuations/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = await storage.getValuationPlatformId(Number(req.params.id));
      if (!platformId) return res.status(404).json({ message: "Valuation not found" });
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Valuation not found" });
      
      await storage.deleteValuation(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      res.status(404).json({ message: "Valuation not found" });
    }
  });

  // --- Assets (for asset_returns and item_valuations platform modes) ---
  app.get('/api/platforms/:platformId/assets', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });
      
      const assets = await storage.getAssets(platformId);
      res.json(assets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch assets" });
    }
  });

  app.get('/api/assets/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const assetId = Number(req.params.id);
      const isOwner = await storage.verifyAssetOwnership(assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Asset not found" });
      
      const asset = await storage.getAsset(assetId);
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      res.json(asset);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch asset" });
    }
  });

  app.post('/api/assets', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const body = {
        ...req.body,
        acquisitionDate: req.body.acquisitionDate ? new Date(req.body.acquisitionDate) : undefined,
        exitDate: req.body.exitDate ? new Date(req.body.exitDate) : null,
      };
      const input = insertAssetSchema.parse(body);
      const isOwner = await storage.verifyPlatformOwnership(input.platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });
      
      const asset = await storage.createAsset(input);
      res.status(201).json(asset);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to create asset" });
    }
  });

  app.patch('/api/assets/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const assetId = Number(req.params.id);
      const isOwner = await storage.verifyAssetOwnership(assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Asset not found" });
      
      const body = { ...req.body };
      if (body.acquisitionDate) body.acquisitionDate = new Date(body.acquisitionDate);
      if (body.exitDate) body.exitDate = new Date(body.exitDate);
      
      const input = insertAssetSchema.partial().parse(body);
      const asset = await storage.updateAsset(assetId, input);
      res.json(asset);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(404).json({ message: "Asset not found" });
    }
  });

  app.delete('/api/assets/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const assetId = Number(req.params.id);
      const isOwner = await storage.verifyAssetOwnership(assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Asset not found" });
      
      await storage.deleteAsset(assetId);
      res.json({ success: true });
    } catch (error) {
      res.status(404).json({ message: "Asset not found" });
    }
  });

  app.post('/api/assets/:id/exit', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const assetId = Number(req.params.id);
      const isOwner = await storage.verifyAssetOwnership(assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Asset not found" });
      
      const { exitDate, exitPrice } = req.body;
      if (!exitDate || !exitPrice) {
        return res.status(400).json({ message: "exitDate and exitPrice are required" });
      }
      const asset = await storage.exitAsset(assetId, new Date(exitDate), exitPrice);
      res.json(asset);
    } catch (error) {
      res.status(404).json({ message: "Asset not found" });
    }
  });

  // --- Asset Valuations ---
  app.get('/api/assets/:assetId/valuations', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const assetId = Number(req.params.assetId);
      const isOwner = await storage.verifyAssetOwnership(assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Asset not found" });
      
      const valuations = await storage.getAssetValuations(assetId);
      res.json(valuations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch asset valuations" });
    }
  });

  app.post('/api/asset-valuations', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      
      // Convert date string to Date object if provided
      const body = { ...req.body };
      if (body.date && typeof body.date === 'string') {
        body.date = new Date(body.date);
      }
      
      const input = insertAssetValuationSchema.parse(body);
      const isOwner = await storage.verifyAssetOwnership(input.assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Asset not found" });
      
      const valuation = await storage.createAssetValuation(input);
      res.status(201).json(valuation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to create asset valuation" });
    }
  });

  app.patch('/api/asset-valuations/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const assetId = await storage.getAssetValuationAssetId(Number(req.params.id));
      if (!assetId) return res.status(404).json({ message: "Asset valuation not found" });
      const isOwner = await storage.verifyAssetOwnership(assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Asset valuation not found" });
      
      // Convert date string to Date object if provided
      const body = { ...req.body };
      if (body.date && typeof body.date === 'string') {
        body.date = new Date(body.date);
      }
      
      const input = insertAssetValuationSchema.partial().parse(body);
      const valuation = await storage.updateAssetValuation(Number(req.params.id), input);
      res.json(valuation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(404).json({ message: "Asset valuation not found" });
    }
  });

  app.delete('/api/asset-valuations/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const assetId = await storage.getAssetValuationAssetId(Number(req.params.id));
      if (!assetId) return res.status(404).json({ message: "Asset valuation not found" });
      const isOwner = await storage.verifyAssetOwnership(assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Asset valuation not found" });
      
      await storage.deleteAssetValuation(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete asset valuation" });
    }
  });

  // --- CSV Import for Asset Valuations ---
  app.post('/api/platforms/:platformId/asset-valuations/import', requireAuth, upload.single('file'), async (req, res) => {
    const file = req.file;
    
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Read and parse CSV file
      const fileContent = fs.readFileSync(file.path, 'utf-8');
      
      const parseResult = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(),
      });

      if (parseResult.errors.length > 0) {
        return res.status(400).json({ 
          message: "CSV parsing error", 
          errors: parseResult.errors.map(e => e.message) 
        });
      }

      // Get all assets for this platform for name matching
      const platformAssets = await db.select().from(assets)
        .where(eq(assets.platformId, platformId));

      // Helper function to normalize asset names for matching
      const normalizeName = (name: string): string => {
        return name
          .toLowerCase()
          .trim()
          .replace(/\s+/g, ' ')           // Collapse multiple spaces
          .replace(/[^\w\s]/g, '')        // Remove special characters
          .replace(/\s/g, '');            // Remove all spaces for comparison
      };

      // Simple Levenshtein distance for fuzzy matching
      const levenshteinDistance = (a: string, b: string): number => {
        const matrix: number[][] = [];
        for (let i = 0; i <= b.length; i++) {
          matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
          matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
          for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
              matrix[i][j] = matrix[i - 1][j - 1];
            } else {
              matrix[i][j] = Math.min(
                matrix[i - 1][j - 1] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j] + 1
              );
            }
          }
        }
        return matrix[b.length][a.length];
      };

      // Find best matching asset with fuzzy matching
      const findMatchingAsset = (csvName: string) => {
        const normalizedCsvName = normalizeName(csvName);
        
        // First try exact match after normalization
        const exactMatch = platformAssets.find(a => 
          normalizeName(a.name) === normalizedCsvName
        );
        if (exactMatch) return { asset: exactMatch, matchType: 'exact' };

        // Try fuzzy matching - find the closest match
        let bestMatch: typeof platformAssets[0] | null = null;
        let bestDistance = Infinity;
        
        for (const asset of platformAssets) {
          const normalizedAssetName = normalizeName(asset.name);
          const distance = levenshteinDistance(normalizedCsvName, normalizedAssetName);
          
          // Calculate similarity ratio (0 to 1, higher is better)
          const maxLength = Math.max(normalizedCsvName.length, normalizedAssetName.length);
          const similarity = maxLength > 0 ? 1 - (distance / maxLength) : 0;
          
          // Accept matches with 80%+ similarity
          if (similarity >= 0.8 && distance < bestDistance) {
            bestDistance = distance;
            bestMatch = asset;
          }
        }
        
        if (bestMatch) return { asset: bestMatch, matchType: 'fuzzy' };
        return null;
      };

      const results = {
        success: 0,
        failed: 0,
        errors: [] as { row: number; assetName: string; error: string }[]
      };

      // Process each row
      for (let i = 0; i < parseResult.data.length; i++) {
        const row = parseResult.data[i] as Record<string, string>;
        const rowNum = i + 2; // Account for header row and 0-index

        // Find asset name column (supports various column names)
        const assetName = row['asset'] || row['asset name'] || row['name'] || row['assetname'] || '';
        const valueStr = row['value'] || row['valuation'] || row['price'] || row['current value'] || '';
        const dateStr = row['date'] || row['valuation date'] || row['valuationdate'] || '';

        if (!assetName.trim()) {
          results.failed++;
          results.errors.push({ row: rowNum, assetName: '(empty)', error: 'Missing asset name' });
          continue;
        }

        if (!valueStr.trim()) {
          results.failed++;
          results.errors.push({ row: rowNum, assetName, error: 'Missing value' });
          continue;
        }

        // Parse value - remove currency symbols and handle number formats
        // Supports both European (1.234,56) and US (1,234.56) formats
        let cleanValue = valueStr.replace(/[^0-9.,\-]/g, '');
        // If there's both comma and dot, determine format by which comes last
        const lastComma = cleanValue.lastIndexOf(',');
        const lastDot = cleanValue.lastIndexOf('.');
        if (lastComma > lastDot) {
          // European format: 1.234,56 -> 1234.56
          cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
        } else {
          // US format or no decimal: 1,234.56 -> 1234.56
          cleanValue = cleanValue.replace(/,/g, '');
        }
        const value = parseFloat(cleanValue);
        if (isNaN(value)) {
          results.failed++;
          results.errors.push({ row: rowNum, assetName, error: `Invalid value: ${valueStr}` });
          continue;
        }

        // Parse date
        let date: Date;
        if (dateStr.trim()) {
          date = new Date(dateStr);
          if (isNaN(date.getTime())) {
            results.failed++;
            results.errors.push({ row: rowNum, assetName, error: `Invalid date: ${dateStr}` });
            continue;
          }
        } else {
          date = new Date(); // Default to today
        }

        // Match asset by name with fuzzy matching
        const matchResult = findMatchingAsset(assetName);

        if (!matchResult) {
          results.failed++;
          results.errors.push({ row: rowNum, assetName, error: 'Asset not found in platform' });
          continue;
        }
        
        const matchedAsset = matchResult.asset;

        try {
          // Create the valuation
          await storage.createAssetValuation({
            assetId: matchedAsset.id,
            value: value.toString(),
            date,
            notes: `Imported from CSV`,
          });
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({ row: rowNum, assetName, error: 'Failed to create valuation' });
        }
      }

      res.json({
        message: `Import complete: ${results.success} valuations created, ${results.failed} failed`,
        ...results
      });
    } catch (error) {
      console.error("CSV import error:", error);
      res.status(500).json({ message: "Failed to import CSV" });
    } finally {
      // Clean up temp file
      if (file && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (e) {
          console.error("Failed to clean up temp file:", e);
        }
      }
    }
  });

  // --- Asset Repayments (partial principal repayments) ---
  app.get('/api/assets/:assetId/repayments', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const assetId = Number(req.params.assetId);
      const isOwner = await storage.verifyAssetOwnership(assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Asset not found" });
      
      const repayments = await storage.getAssetRepayments(assetId);
      res.json(repayments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch asset repayments" });
    }
  });

  app.post('/api/asset-repayments', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      // Convert date string to Date object if needed
      const body = {
        ...req.body,
        date: req.body.date ? new Date(req.body.date) : new Date()
      };
      const input = insertAssetRepaymentSchema.parse(body);
      const isOwner = await storage.verifyAssetOwnership(input.assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Asset not found" });
      
      const repayment = await storage.createAssetRepayment(input);
      res.status(201).json(repayment);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Failed to create asset repayment" });
    }
  });

  app.patch('/api/asset-repayments/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const repaymentId = Number(req.params.id);
      const assetId = await storage.getAssetRepaymentAssetId(repaymentId);
      if (!assetId) return res.status(404).json({ message: "Repayment not found" });
      
      const isOwner = await storage.verifyAssetOwnership(assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Repayment not found" });
      
      const { amount, date, notes } = req.body;
      // Convert date string to Date object if needed
      const parsedDate = date ? new Date(date) : undefined;
      const repayment = await storage.updateAssetRepayment(repaymentId, { 
        amount, 
        date: parsedDate, 
        notes 
      });
      res.json(repayment);
    } catch (error) {
      res.status(500).json({ message: "Failed to update repayment" });
    }
  });

  app.delete('/api/asset-repayments/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const repaymentId = Number(req.params.id);
      const assetId = await storage.getAssetRepaymentAssetId(repaymentId);
      if (!assetId) return res.status(404).json({ message: "Repayment not found" });
      
      const isOwner = await storage.verifyAssetOwnership(assetId, userId);
      if (!isOwner) return res.status(404).json({ message: "Repayment not found" });
      
      await storage.deleteAssetRepayment(repaymentId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete repayment" });
    }
  });

  // --- Asset Performance History ---
  app.get('/api/platforms/:platformId/asset-performance', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });
      
      const history = await storage.getAssetPerformanceHistory(platformId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch asset performance history" });
    }
  });

  // Item bubble chart data for item_valuations platforms
  app.get('/api/platforms/:platformId/item-bubbles', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const statusFilter = (req.query.statusFilter as string) || "all";
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });
      
      const bubbles = await storage.getItemReturnBubbles(platformId, statusFilter);
      res.json(bubbles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch item bubble data" });
    }
  });

  // Item cohort return data for item_valuations platforms - shows average return per month cohort
  app.get('/api/platforms/:platformId/item-cohort-returns', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const statusFilter = (req.query.statusFilter as string) || "all";
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });
      
      const cohorts = await storage.getItemCohortReturns(platformId, statusFilter);
      res.json(cohorts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch item cohort data" });
    }
  });

  // --- Insights ---
  app.post(api.insights.generate.path, requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const { prompt } = req.body;
      
      // Fetch all data to provide context to AI
      const platforms = await storage.getPlatforms(userId);
      // Prepare context string
      const context = JSON.stringify({
        platforms: platforms.map(p => ({
          name: p.name,
          category: p.category,
          currentValue: p.currentValue,
          totalInvested: p.totalInvested,
          netProfit: (p.currentValue || 0) - (p.totalInvested || 0)
        })),
        totalPortfolioValue: platforms.reduce((sum, p) => sum + (p.currentValue || 0), 0),
        totalPortfolioInvested: platforms.reduce((sum, p) => sum + (p.totalInvested || 0), 0)
      }, null, 2);

      const systemPrompt = `You are a financial analyst assistant. Analyze the following investment portfolio data and provide insights. 
      Focus on diversification, performance, and potential risks. 
      Data: ${context}`;
      
      const userPrompt = prompt || "Give me a summary of my portfolio performance and any recommendations.";

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      });

      const insight = response.choices[0]?.message?.content || "Could not generate insights at this time.";
      
      res.json({ insight });
    } catch (error) {
      console.error("Error generating insights:", error);
      res.status(500).json({ message: "Failed to generate insights" });
    }
  });

  app.get(api.portfolio.history.path, requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const range = req.query.range as string || 'year';
      const platformId = req.query.platformId ? Number(req.query.platformId) : null;
      const excludePlatforms = req.query.excludePlatforms 
        ? (req.query.excludePlatforms as string).split(',').map(Number).filter(n => !isNaN(n))
        : [];
      
      // Verify platform ownership if specified
      if (platformId) {
        const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
        if (!isOwner) return res.json([]);
      }
      
      // Use user-scoped storage methods
      const userInvestments = await storage.getAllInvestmentsForUser(userId);
      const userValuations = await storage.getAllValuationsForUser(userId);
      const userWithdrawals = await storage.getAllWithdrawalsForUser(userId);
      
      let filteredInvestments = platformId 
        ? userInvestments.filter(inv => inv.platformId === platformId)
        : userInvestments;
      
      let filteredValuations = platformId
        ? userValuations.filter(val => val.platformId === platformId)
        : userValuations;
      
      let filteredWithdrawals = platformId
        ? userWithdrawals.filter(wd => wd.platformId === platformId)
        : userWithdrawals;
      
      // Apply platform exclusion filter
      if (excludePlatforms.length > 0) {
        filteredInvestments = filteredInvestments.filter(inv => !excludePlatforms.includes(inv.platformId));
        filteredValuations = filteredValuations.filter(val => !excludePlatforms.includes(val.platformId));
        filteredWithdrawals = filteredWithdrawals.filter(wd => !excludePlatforms.includes(wd.platformId));
      }
      
      const dates = new Set<string>();
      filteredInvestments.forEach(inv => dates.add(new Date(inv.date).toISOString().split('T')[0]));
      filteredValuations.forEach(val => dates.add(new Date(val.date).toISOString().split('T')[0]));
      filteredWithdrawals.forEach(wd => dates.add(new Date(wd.date).toISOString().split('T')[0]));
      
      let sortedDates = Array.from(dates).sort();
      
      // Apply date filtering based on range
      const now = new Date();
      let startDate: Date | null = null;
      
      if (range === '7d') startDate = new Date(now.setDate(now.getDate() - 7));
      else if (range === 'month') startDate = new Date(now.setMonth(now.getMonth() - 1));
      else if (range === 'quarter') startDate = new Date(now.setMonth(now.getMonth() - 3));
      else if (range === 'year') startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      else if (range.startsWith('year-')) {
        const year = parseInt(range.split('-')[1]);
        startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31, 23, 59, 59);
        sortedDates = sortedDates.filter(d => {
          const dt = new Date(d);
          return dt >= startDate! && dt <= endDate;
        });
        startDate = null; // Prevent further filtering
      } else if (range.startsWith('month-')) {
        const parts = range.split('-');
        const year = parseInt(parts[1]);
        const month = parseInt(parts[2]) - 1;
        
        // Start date is now 1 month earlier to include the previous month for MoM comparison
        const prevMonthStartDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59);
        
        sortedDates = sortedDates.filter(d => {
          const dt = new Date(d);
          return dt >= prevMonthStartDate && dt <= endDate;
        });
        startDate = null; // Prevent further filtering
      }

      if (startDate) {
        sortedDates = sortedDates.filter(d => new Date(d) >= startDate!);
      }

      const rawHistory = sortedDates.map(date => {
        const dateObj = new Date(date);
        
        // Sum investments up to this date
        const totalInvested = filteredInvestments
          .filter(inv => new Date(inv.date) <= dateObj)
          .reduce((sum, inv) => sum + Number(inv.amount), 0);
        
        // Sum withdrawals up to this date
        const totalWithdrawn = filteredWithdrawals
          .filter(wd => new Date(wd.date) <= dateObj)
          .reduce((sum, wd) => sum + Number(wd.amount), 0);
        
        // Net invested = investments - withdrawals
        const invested = totalInvested - totalWithdrawn;
          
        // Get latest valuation for each platform up to this date
        const platformLatestValuations = new Map<number, number>();
        // Process valuations in chronological order to find the latest for each platform by the target date
        [...filteredValuations]
          .reverse() // Sort to chronological
          .filter(val => new Date(val.date) <= dateObj)
          .forEach(val => {
            platformLatestValuations.set(val.platformId, Number(val.value));
          });
          
        const totalValue = Array.from(platformLatestValuations.values()).reduce((sum, val) => sum + val, 0);
        
        return {
          date,
          value: totalValue,
          invested
        };
      });
      
      res.json(rawHistory);
    } catch (error) {
      console.error("Error fetching portfolio history:", error);
      res.status(500).json({ message: "Failed to fetch portfolio history" });
    }
  });

  app.get('/api/portfolio/available-filters', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = req.query.platformId ? Number(req.query.platformId) : null;
      
      // Verify platform ownership if specified
      if (platformId) {
        const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
        if (!isOwner) return res.json({ years: [], months: [] });
      }
      
      // Use user-scoped storage methods
      const userInvestments = await storage.getAllInvestmentsForUser(userId);
      const userValuations = await storage.getAllValuationsForUser(userId);
      
      const filteredInvestments = platformId 
        ? userInvestments.filter(inv => inv.platformId === platformId)
        : userInvestments;
      
      const filteredValuations = platformId
        ? userValuations.filter(val => val.platformId === platformId)
        : userValuations;

      const dates = new Set<string>();
      filteredInvestments.forEach(inv => dates.add(new Date(inv.date).toISOString().split('T')[0]));
      filteredValuations.forEach(val => dates.add(new Date(val.date).toISOString().split('T')[0]));
      
      const sortedDates = Array.from(dates).sort();
      const years = new Set<string>();
      const months = new Set<string>(); // Format: YYYY-MM

      sortedDates.forEach(d => {
        const dt = new Date(d);
        const year = dt.getFullYear().toString();
        const month = (dt.getMonth() + 1).toString().padStart(2, '0');
        years.add(year);
        months.add(`${year}-${month}`);
      });

      res.json({
        years: Array.from(years).sort().reverse(),
        months: Array.from(months).sort().reverse()
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch available filters" });
    }
  });

  // Per-platform month-over-month performance
  app.get('/api/portfolio/platform-mom', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      
      const userPlatforms = await storage.getPlatforms(userId);
      const userValuations = await storage.getAllValuationsForUser(userId);
      const userInvestments = await storage.getAllInvestmentsForUser(userId);
      const userWithdrawals = await storage.getAllWithdrawalsForUser(userId);
      
      // Calculate per-platform MoM using a rolling last-30-days window.
      // Find the most recent valuation, then the closest valuation ~30 days before it.
      const platformMom = userPlatforms.map((platform: any) => {
        // Get all valuations for this platform sorted newest-first
        const platformVals = userValuations
          .filter((v: any) => v.platformId === platform.id)
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (platformVals.length < 2) {
          const currentValue = platformVals.length === 1 ? Number(platformVals[0].value) : 0;
          return {
            platformId: platform.id,
            name: platform.name,
            customIconUrl: (platform as any).customIconUrl,
            currentValue,
            prevValue: 0,
            momChange: 0,
            momGrowthPercent: 0
          };
        }

        // Most recent valuation is the "current" point
        const latestVal = platformVals[0];
        const currentValue = Number(latestVal.value);
        const currentDate = new Date(latestVal.date);

        // Target: exactly 30 days before the current date
        const target = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Find the valuation (excluding the latest) whose date is closest to the target
        const prevValEntry = platformVals
          .slice(1)
          .reduce((best: any, v: any) => {
            const dist = Math.abs(new Date(v.date).getTime() - target.getTime());
            const bestDist = Math.abs(new Date(best.date).getTime() - target.getTime());
            return dist < bestDist ? v : best;
          });

        const prevValue = Number(prevValEntry.value);
        const prevDate = new Date(prevValEntry.date);

        // Net investments/withdrawals between the two data points (exclusive of prevDate, inclusive of currentDate)
        const netInvestmentsDuringPeriod =
          userInvestments
            .filter((i: any) => i.platformId === platform.id)
            .filter((i: any) => { const d = new Date(i.date); return d > prevDate && d <= currentDate; })
            .reduce((sum: number, i: any) => sum + Number(i.amount), 0)
          - userWithdrawals
            .filter((w: any) => w.platformId === platform.id)
            .filter((w: any) => { const d = new Date(w.date); return d > prevDate && d <= currentDate; })
            .reduce((sum: number, w: any) => sum + Number(w.amount), 0);

        // MoM change = value change − net deposits (organic growth only)
        const momChange = (currentValue - prevValue) - netInvestmentsDuringPeriod;
        const momGrowthPercent = prevValue > 0 ? (momChange / prevValue) * 100 : 0;

        return {
          platformId: platform.id,
          name: platform.name,
          customIconUrl: (platform as any).customIconUrl,
          currentValue,
          prevValue,
          momChange,
          momGrowthPercent
        };
      });
      
      res.json(platformMom);
    } catch (error) {
      console.error("Error fetching platform MoM:", error);
      res.status(500).json({ message: "Failed to fetch platform MoM data" });
    }
  });

  // --- Portfolio: Per-platform rolling returns (7d / 30d / 90d) ---
  app.get('/api/portfolio/platform-rolling-returns', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const userPlatforms = await storage.getPlatforms(userId);
      const userValuations = await storage.getAllValuationsForUser(userId);
      const userInvestments = await storage.getAllInvestmentsForUser(userId);
      const userWithdrawals = await storage.getAllWithdrawalsForUser(userId);

      const computePlatformWindow = (days: number) =>
        (userPlatforms as any[]).map((platform) => {
          const platformVals = userValuations
            .filter((v: any) => v.platformId === platform.id)
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

          if (platformVals.length < 2) {
            return { platformId: platform.id, name: platform.name, color: platform.color || '#6b7280', change: 0, pct: 0, prevValue: 0 };
          }

          const latestVal = platformVals[0];
          const currentValue = Number(latestVal.value);
          const currentDate = new Date(latestVal.date);

          const now = new Date();
          const daysSinceLatest = (now.getTime() - currentDate.getTime()) / (24 * 60 * 60 * 1000);
          if (daysSinceLatest > days) {
            return { platformId: platform.id, name: platform.name, color: platform.color || '#6b7280', change: 0, pct: 0, prevValue: 0, stale: true };
          }

          const target = new Date(currentDate.getTime() - days * 24 * 60 * 60 * 1000);

          const prevValEntry = platformVals.slice(1).reduce((best: any, v: any) => {
            const dist = Math.abs(new Date(v.date).getTime() - target.getTime());
            const bestDist = Math.abs(new Date(best.date).getTime() - target.getTime());
            return dist < bestDist ? v : best;
          });

          const prevValue = Number(prevValEntry.value);
          const prevDate = new Date(prevValEntry.date);

          const netFlow =
            userInvestments
              .filter((i: any) => i.platformId === platform.id)
              .filter((i: any) => { const d = new Date(i.date); return d > prevDate && d <= currentDate; })
              .reduce((sum: number, i: any) => sum + Number(i.amount), 0)
            - userWithdrawals
              .filter((w: any) => w.platformId === platform.id)
              .filter((w: any) => { const d = new Date(w.date); return d > prevDate && d <= currentDate; })
              .reduce((sum: number, w: any) => sum + Number(w.amount), 0);

          const change = (currentValue - prevValue) - netFlow;
          const pct = prevValue > 0 ? (change / prevValue) * 100 : 0;
          return { platformId: platform.id, name: platform.name, color: platform.color || '#6b7280', change, pct, prevValue };
        });

      res.json({
        d7:  computePlatformWindow(7),
        d30: computePlatformWindow(30),
        d90: computePlatformWindow(90),
      });
    } catch (error) {
      console.error("Error fetching platform rolling returns:", error);
      res.status(500).json({ message: "Failed to fetch platform rolling returns" });
    }
  });

  // --- Analytics: Investment Flow ---
  app.get('/api/analytics/investment-flow', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const userPlatforms = await storage.getPlatforms(userId);
      const userInvestments = await storage.getAllInvestmentsForUser(userId);
      const userWithdrawals = await storage.getAllWithdrawalsForUser(userId);

      // Build a map of platformId -> { name, color }
      const platformInfoMap = new Map<number, { name: string; color: string }>();
      for (const p of userPlatforms) {
        platformInfoMap.set(p.id, { name: p.name, color: p.color || '#6b7280' });
      }

      // Gather all platforms that have any investment/withdrawal activity
      const activePlatformIds = new Set<number>();
      userInvestments.forEach(i => activePlatformIds.add(i.platformId));
      userWithdrawals.forEach(w => activePlatformIds.add(w.platformId));

      const allPlatforms = Array.from(activePlatformIds)
        .map(id => platformInfoMap.get(id))
        .filter(Boolean) as { name: string; color: string }[];

      // Build month -> platformName -> net amount map
      const monthPlatformMap = new Map<string, Map<string, number>>();

      for (const inv of userInvestments) {
        const d = new Date(inv.date);
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const pInfo = platformInfoMap.get(inv.platformId);
        if (!pInfo) continue;
        if (!monthPlatformMap.has(month)) monthPlatformMap.set(month, new Map());
        const pm = monthPlatformMap.get(month)!;
        pm.set(pInfo.name, (pm.get(pInfo.name) || 0) + Number(inv.amount));
      }

      for (const wd of userWithdrawals) {
        const d = new Date(wd.date);
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const pInfo = platformInfoMap.get(wd.platformId);
        if (!pInfo) continue;
        if (!monthPlatformMap.has(month)) monthPlatformMap.set(month, new Map());
        const pm = monthPlatformMap.get(month)!;
        pm.set(pInfo.name, (pm.get(pInfo.name) || 0) - Number(wd.amount));
      }

      // Build response rows: { month: string, [platformName]: number }
      const sortedMonths = Array.from(monthPlatformMap.keys()).sort();
      const result = sortedMonths.map(month => {
        const pm = monthPlatformMap.get(month)!;
        const row: Record<string, string | number> = { month };
        for (const p of allPlatforms) {
          row[p.name] = pm.get(p.name) || 0;
        }
        return row;
      });

      res.json({ months: result, platforms: allPlatforms });
    } catch (error) {
      console.error("Error fetching investment flow:", error);
      res.status(500).json({ message: "Failed to fetch investment flow data" });
    }
  });

  app.get('/api/analytics/monthly-platform-breakdown', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const userPlatforms = await storage.getPlatforms(userId);
      const userInvestments = await storage.getAllInvestmentsForUser(userId);
      const userValuations = await storage.getAllValuationsForUser(userId);
      const userWithdrawals = await storage.getAllWithdrawalsForUser(userId);

      // Collect all unique year-months that have any data
      const monthSet = new Set<string>();
      const toYM = (date: string | Date) => {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      };
      userInvestments.forEach(i => monthSet.add(toYM(i.date)));
      userValuations.forEach(v => monthSet.add(toYM(v.date)));
      userWithdrawals.forEach(w => monthSet.add(toYM(w.date)));
      const sortedMonths = Array.from(monthSet).sort();

      // For a given platform, get the valuation closest to the 10th of a given year-month.
      // Once the 10th of that month has passed (relative to today), prefers valuations on or
      // before the 10th so that post-10th movements flow into the next month's live cell
      // instead of being absorbed into the already-closed month's anchor.
      // Falls back to the nearest valuation overall if no pre/on-10th data exists.
      const getPlatformValueNearTenthOfMonth = (platformId: number, ym: string): { value: number; date: Date } => {
        const [year, month] = ym.split('-').map(Number);
        // Reference point for proximity calculations (start of the 10th)
        const tenthStart = new Date(year, month - 1, 10, 0, 0, 0, 0);
        const tenth = tenthStart.getTime();
        // End-of-day boundary for the 10th — ensures valuations at any time on the 10th
        // are treated as "on or before the 10th" regardless of their time component.
        const tenthEndOfDay = new Date(year, month - 1, 10, 23, 59, 59, 999);
        const relevant = userValuations.filter(v => v.platformId === platformId);
        if (relevant.length === 0) return { value: 0, date: new Date(tenth) };

        // If today is past the 10th of this month, lock the anchor to valuations on or before the 10th.
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const tenthHasPassed = todayStart > tenthEndOfDay;

        if (tenthHasPassed) {
          const preOrOnTenth = relevant.filter(v => new Date(v.date) <= tenthEndOfDay);
          if (preOrOnTenth.length > 0) {
            // Closest valuation on or before the end of the 10th
            const closest = preOrOnTenth.reduce((best, v) => {
              const dist = Math.abs(new Date(v.date).getTime() - tenth);
              const bestDist = Math.abs(new Date(best.date).getTime() - tenth);
              return dist < bestDist ? v : best;
            });
            return { value: Number(closest.value), date: new Date(closest.date) };
          }
          // No pre/on-10th data — fall through to nearest overall (existing behavior)
        }

        const closest = relevant.reduce((best, v) => {
          const dist = Math.abs(new Date(v.date).getTime() - tenth);
          const bestDist = Math.abs(new Date(best.date).getTime() - tenth);
          return dist < bestDist ? v : best;
        });
        return { value: Number(closest.value), date: new Date(closest.date) };
      };

      // Net cash added to a platform between two dates (exclusive start, inclusive end)
      const getNetCashBetween = (platformId: number, fromDate: Date, toDate: Date): number => {
        const invested = userInvestments
          .filter(i => i.platformId === platformId)
          .filter(i => { const d = new Date(i.date); return d > fromDate && d <= toDate; })
          .reduce((s, i) => s + Number(i.amount), 0);
        const withdrawn = userWithdrawals
          .filter(w => w.platformId === platformId)
          .filter(w => { const d = new Date(w.date); return d > fromDate && d <= toDate; })
          .reduce((s, w) => s + Number(w.amount), 0);
        return invested - withdrawn;
      };

      const result: Record<string, { platformId: number; name: string; color: string; gain: number; gainPct: number | null; inProgress?: boolean }[]> = {};

      for (let i = 1; i < sortedMonths.length; i++) {
        const prevYM = sortedMonths[i - 1];
        const currYM = sortedMonths[i];
        const breakdown: { platformId: number; name: string; color: string; prevVal: number; currVal: number; gain: number; gainPct: number | null }[] = [];

        for (const p of userPlatforms) {
          const prev = getPlatformValueNearTenthOfMonth(p.id, prevYM);
          const curr = getPlatformValueNearTenthOfMonth(p.id, currYM);
          const netCash = getNetCashBetween(p.id, prev.date, curr.date);
          const gain = curr.value - prev.value - netCash;
          const gainPct = prev.value > 0 ? (gain / prev.value) * 100 : null;
          if (prev.value > 0 || curr.value > 0) {
            breakdown.push({ platformId: p.id, name: p.name, color: p.color, prevVal: prev.value, currVal: curr.value, gain, gainPct });
          }
        }

        breakdown.sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));
        if (breakdown.length > 0) result[currYM] = breakdown;
      }

      // Generate a live "current month in progress" cell when today's month
      // is not yet represented in the data (e.g. it's April 16 but the last
      // recorded entry is still April because no May data exists yet).
      const now = new Date();
      const todayYM = toYM(now);
      // Use last key present in result (months with actual breakdown rows) rather
      // than sortedMonths, so we don't skip the live cell when the latest
      // activity month produced no breakdown entries.
      const resultMonths = Object.keys(result).sort();
      const lastKnownMonth = resultMonths.length > 0 ? resultMonths[resultMonths.length - 1] : sortedMonths[sortedMonths.length - 1];
      if (lastKnownMonth && todayYM > lastKnownMonth && !result[todayYM]) {
        const liveBreakdown: { platformId: number; name: string; color: string; prevVal: number; currVal: number; gain: number; gainPct: number | null; inProgress: boolean }[] = [];

        for (const p of userPlatforms) {
          // prev = nearest to 10th of last known month (locked anchor)
          const prev = getPlatformValueNearTenthOfMonth(p.id, lastKnownMonth);
          // curr = absolute latest valuation for this platform
          const platformValuations = userValuations.filter(v => v.platformId === p.id);
          if (platformValuations.length === 0) continue;
          const latest = platformValuations.reduce((a, b) =>
            new Date(a.date) > new Date(b.date) ? a : b
          );
          const currVal = Number(latest.value);
          const currDate = new Date(latest.date);
          const netCash = getNetCashBetween(p.id, prev.date, currDate);
          const gain = currVal - prev.value - netCash;
          const gainPct = prev.value > 0 ? (gain / prev.value) * 100 : null;
          if (prev.value > 0 || currVal > 0) {
            liveBreakdown.push({ platformId: p.id, name: p.name, color: p.color, prevVal: prev.value, currVal, gain, gainPct, inProgress: true });
          }
        }

        liveBreakdown.sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));
        if (liveBreakdown.length > 0) result[todayYM] = liveBreakdown;
      }

      // Second live-cell trigger: we're past the 10th of the current month and
      // the current month already has a locked (pre-10th) cell in result.
      // Post-10th movements should appear as a live "next month" cell.
      const todayYear = now.getFullYear();
      const todayMonth = now.getMonth() + 1; // 1-indexed
      const tenthEndToday = new Date(todayYear, todayMonth - 1, 10, 23, 59, 59, 999);
      const pastTenthOfCurrentMonth = now > tenthEndToday;
      if (pastTenthOfCurrentMonth && lastKnownMonth === todayYM) {
        // Compute next month's YM string
        const nextMonth = todayMonth === 12 ? 1 : todayMonth + 1;
        const nextYear = todayMonth === 12 ? todayYear + 1 : todayYear;
        const nextMonthYM = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
        if (!result[nextMonthYM]) {
          const liveNextBreakdown: { platformId: number; name: string; color: string; prevVal: number; currVal: number; gain: number; gainPct: number | null; inProgress: boolean }[] = [];

          for (const p of userPlatforms) {
            // prev = current month's pre-10th locked anchor
            const prev = getPlatformValueNearTenthOfMonth(p.id, todayYM);
            // curr = absolute latest valuation for this platform (includes post-10th entries)
            const platformValuations = userValuations.filter(v => v.platformId === p.id);
            if (platformValuations.length === 0) continue;
            const latest = platformValuations.reduce((a, b) =>
              new Date(a.date) > new Date(b.date) ? a : b
            );
            const currVal = Number(latest.value);
            const currDate = new Date(latest.date);
            // Only include if there is a post-10th valuation (otherwise nothing new to show)
            if (currDate <= tenthEndToday) continue;
            const netCash = getNetCashBetween(p.id, prev.date, currDate);
            const gain = currVal - prev.value - netCash;
            const gainPct = prev.value > 0 ? (gain / prev.value) * 100 : null;
            if (prev.value > 0 || currVal > 0) {
              liveNextBreakdown.push({ platformId: p.id, name: p.name, color: p.color, prevVal: prev.value, currVal, gain, gainPct, inProgress: true });
            }
          }

          liveNextBreakdown.sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));
          if (liveNextBreakdown.length > 0) result[nextMonthYM] = liveNextBreakdown;
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching monthly platform breakdown:", error);
      res.status(500).json({ message: "Failed to fetch monthly platform breakdown" });
    }
  });

  // --- Portfolio Waterfall ---
  app.get('/api/portfolio/waterfall', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const granularity = (req.query.granularity as string) || 'month';
      const excludePlatforms = req.query.excludePlatforms
        ? (req.query.excludePlatforms as string).split(',').map(Number).filter(n => !isNaN(n))
        : [];

      const userPlatforms = await storage.getPlatforms(userId);
      const userInvestments = await storage.getAllInvestmentsForUser(userId);
      const userWithdrawals = await storage.getAllWithdrawalsForUser(userId);
      const userValuations = await storage.getAllValuationsForUser(userId);

      const filteredPlatforms = userPlatforms.filter(p => !excludePlatforms.includes(p.id));
      const filteredInvestments = userInvestments.filter(inv => !excludePlatforms.includes(inv.platformId));
      const filteredWithdrawals = userWithdrawals.filter(wd => !excludePlatforms.includes(wd.platformId));
      const filteredValuations = userValuations.filter(val => !excludePlatforms.includes(val.platformId));

      // Helper: format a date to a period key
      const toPeriodKey = (date: Date): string => {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        if (granularity === 'year') {
          return `${y}`;
        } else if (granularity === 'quarter') {
          const q = Math.ceil(m / 3);
          return `${y}-Q${q}`;
        } else {
          return `${y}-${String(m).padStart(2, '0')}`;
        }
      };

      // Collect all period keys
      const periodSet = new Set<string>();
      filteredInvestments.forEach(inv => periodSet.add(toPeriodKey(new Date(inv.date))));
      filteredWithdrawals.forEach(wd => periodSet.add(toPeriodKey(new Date(wd.date))));
      filteredValuations.forEach(val => periodSet.add(toPeriodKey(new Date(val.date))));
      
      if (periodSet.size === 0) {
        return res.json([]);
      }

      const sortedPeriods = Array.from(periodSet).sort();

      // Get the end-of-period date for a given period key
      const getPeriodEndDate = (key: string): Date => {
        if (granularity === 'year') {
          const y = parseInt(key);
          return new Date(y, 11, 31, 23, 59, 59);
        } else if (granularity === 'quarter') {
          const [y, qStr] = key.split('-');
          const q = parseInt(qStr.replace('Q', ''));
          const endMonth = q * 3; // 3, 6, 9, 12
          return new Date(parseInt(y), endMonth, 0, 23, 59, 59);
        } else {
          const [y, m] = key.split('-').map(Number);
          return new Date(y, m, 0, 23, 59, 59);
        }
      };

      // Get portfolio value at end of a given date
      const getPortfolioValueAtDate = (endDate: Date): number => {
        const platformLatestVals = new Map<number, number>();
        [...filteredValuations]
          .filter(val => new Date(val.date) <= endDate)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .forEach(val => {
            platformLatestVals.set(val.platformId, Number(val.value));
          });
        return Array.from(platformLatestVals.values()).reduce((sum, v) => sum + v, 0);
      };

      // Get platform value at end of a given date
      const getPlatformValueAtDate = (platformId: number, endDate: Date): number => {
        const platformVals = filteredValuations
          .filter(val => val.platformId === platformId && new Date(val.date) <= endDate)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return platformVals.length > 0 ? Number(platformVals[0].value) : 0;
      };

      // Get net invested for period
      const getNetInvested = (startDate: Date, endDate: Date): number => {
        const inv = filteredInvestments
          .filter(i => new Date(i.date) > startDate && new Date(i.date) <= endDate)
          .reduce((s, i) => s + Number(i.amount), 0);
        const wd = filteredWithdrawals
          .filter(w => new Date(w.date) > startDate && new Date(w.date) <= endDate)
          .reduce((s, w) => s + Number(w.amount), 0);
        return inv - wd;
      };

      // Get per-platform net invested for period
      const getPlatformNetInvested = (platformId: number, startDate: Date, endDate: Date): number => {
        const inv = filteredInvestments
          .filter(i => i.platformId === platformId && new Date(i.date) > startDate && new Date(i.date) <= endDate)
          .reduce((s, i) => s + Number(i.amount), 0);
        const wd = filteredWithdrawals
          .filter(w => w.platformId === platformId && new Date(w.date) > startDate && new Date(w.date) <= endDate)
          .reduce((s, w) => s + Number(w.amount), 0);
        return inv - wd;
      };

      interface WaterfallResultItem {
        period: string;
        openValue: number;
        netInvested: number;
        valueChange: number;
        closeValue: number;
        platformBreakdown: { platformId: number; name: string; color: string; netInvested: number; valueChange: number }[];
        isLive?: boolean;
      }

      const epoch = new Date(0);
      const result: WaterfallResultItem[] = [];

      for (let i = 0; i < sortedPeriods.length; i++) {
        const period = sortedPeriods[i];
        const endDate = getPeriodEndDate(period);

        let prevEndDate: Date;
        if (i === 0) {
          prevEndDate = epoch;
        } else {
          prevEndDate = getPeriodEndDate(sortedPeriods[i - 1]);
        }

        const openValue = i === 0 ? 0 : getPortfolioValueAtDate(prevEndDate);
        const closeValue = getPortfolioValueAtDate(endDate);
        const netInvested = getNetInvested(prevEndDate, endDate);
        const valueChange = closeValue - openValue - netInvested;

        const platformBreakdown = filteredPlatforms.map(p => {
          const pNetInvested = getPlatformNetInvested(p.id, prevEndDate, endDate);
          const pOpenValue = i === 0 ? 0 : getPlatformValueAtDate(p.id, prevEndDate);
          const pCloseValue = getPlatformValueAtDate(p.id, endDate);
          const pValueChange = pCloseValue - pOpenValue - pNetInvested;
          return {
            platformId: p.id,
            name: p.name,
            color: p.color,
            netInvested: pNetInvested,
            valueChange: pValueChange,
          };
        }).filter(pb => Math.abs(pb.netInvested) > 0.001 || Math.abs(pb.valueChange) > 0.001);

        result.push({ period, openValue, netInvested, valueChange, closeValue, platformBreakdown });
      }

      // Post-10th live-period fix: when today is past the 10th of the current calendar
      // month and the last known period is the current period, re-cap that period's close
      // at the pre-10th anchor and append a synthetic "next period" bar for post-10th gains.
      // Applies to all granularities (month, quarter, year).
      if (result.length > 0) {
        const now = new Date();
        const todayY = now.getFullYear();
        const todayM = now.getMonth() + 1;
        const todayPeriodKey = toPeriodKey(now);
        const lastPeriod = sortedPeriods[sortedPeriods.length - 1];

        if (lastPeriod === todayPeriodKey) {
          // Anchor is always the 10th of the current calendar month
          const tenthEndOfDay = new Date(todayY, todayM - 1, 10, 23, 59, 59, 999);

          if (now > tenthEndOfDay) {
            const hasPostTenth = filteredValuations.some(v => new Date(v.date) > tenthEndOfDay);

            if (hasPostTenth) {
              // Pop the current-period entry and recompute it capped at tenthEndOfDay
              result.pop();
              const li = sortedPeriods.length - 1;
              const prevEndDate = li === 0 ? epoch : getPeriodEndDate(sortedPeriods[li - 1]);

              const tenthCloseValue = getPortfolioValueAtDate(tenthEndOfDay);
              const tenthOpenValue = li === 0 ? 0 : getPortfolioValueAtDate(prevEndDate);
              const tenthNetInvested = getNetInvested(prevEndDate, tenthEndOfDay);
              const tenthValueChange = tenthCloseValue - tenthOpenValue - tenthNetInvested;

              const tenthPlatformBreakdown = filteredPlatforms.map(p => {
                const pNetInvested = getPlatformNetInvested(p.id, prevEndDate, tenthEndOfDay);
                const pOpenValue = li === 0 ? 0 : getPlatformValueAtDate(p.id, prevEndDate);
                const pCloseValue = getPlatformValueAtDate(p.id, tenthEndOfDay);
                const pValueChange = pCloseValue - pOpenValue - pNetInvested;
                return { platformId: p.id, name: p.name, color: p.color, netInvested: pNetInvested, valueChange: pValueChange };
              }).filter(pb => Math.abs(pb.netInvested) > 0.001 || Math.abs(pb.valueChange) > 0.001);

              result.push({
                period: lastPeriod,
                openValue: tenthOpenValue,
                netInvested: tenthNetInvested,
                valueChange: tenthValueChange,
                closeValue: tenthCloseValue,
                platformBreakdown: tenthPlatformBreakdown,
              });

              // Derive the next-period key based on granularity
              let nextPeriodKey: string;
              if (granularity === 'year') {
                nextPeriodKey = `${todayY + 1}`;
              } else if (granularity === 'quarter') {
                const q = Math.ceil(todayM / 3);
                if (q === 4) {
                  nextPeriodKey = `${todayY + 1}-Q1`;
                } else {
                  nextPeriodKey = `${todayY}-Q${q + 1}`;
                }
              } else {
                const nextMonth = todayM === 12 ? 1 : todayM + 1;
                const nextYear = todayM === 12 ? todayY + 1 : todayY;
                nextPeriodKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
              }

              // Compute the live next-period entry
              const latestValDate = filteredValuations.reduce((latest, v) => {
                const d = new Date(v.date);
                return d > latest ? d : latest;
              }, new Date(0));
              const latestCloseValue = getPortfolioValueAtDate(latestValDate);
              const liveNetInvested = getNetInvested(tenthEndOfDay, latestValDate);
              const liveValueChange = latestCloseValue - tenthCloseValue - liveNetInvested;

              const livePlatformBreakdown = filteredPlatforms.map(p => {
                const pNetInvested = getPlatformNetInvested(p.id, tenthEndOfDay, latestValDate);
                const pOpenValue = getPlatformValueAtDate(p.id, tenthEndOfDay);
                const pCloseValue = getPlatformValueAtDate(p.id, latestValDate);
                const pValueChange = pCloseValue - pOpenValue - pNetInvested;
                return { platformId: p.id, name: p.name, color: p.color, netInvested: pNetInvested, valueChange: pValueChange };
              }).filter(pb => Math.abs(pb.netInvested) > 0.001 || Math.abs(pb.valueChange) > 0.001);

              result.push({
                period: nextPeriodKey,
                openValue: tenthCloseValue,
                netInvested: liveNetInvested,
                valueChange: liveValueChange,
                closeValue: latestCloseValue,
                platformBreakdown: livePlatformBreakdown,
                isLive: true,
              });
            }
          }
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching waterfall data:", error);
      res.status(500).json({ message: "Failed to fetch waterfall data" });
    }
  });

  // --- Analytics: All Assets Enriched (for Portfolio Heatmap) ---
  app.get('/api/analytics/assets', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const userPlatforms = await storage.getPlatforms(userId);

      // For each platform, get assets (only platforms with asset_returns or item_valuations modes have assets)
      const assetPlatforms = userPlatforms.filter(
        (p) => p.platformMode === 'asset_returns' || p.platformMode === 'item_valuations'
      );

      const enrichedAssets: {
        assetId: number;
        assetName: string;
        platformId: number;
        platformName: string;
        platformMode: string;
        category: string;
        assetCategory: string | null;
        currentValue: number;
        invested: number;
        roi: number;
        gainLoss: number;
        acquisitionDate: string | null;
        exitDate: string | null;
      }[] = [];

      for (const platform of assetPlatforms) {
        const platformAssets = await storage.getAssets(platform.id);
        for (const asset of platformAssets) {
          const currentValue = asset.currentValue ?? Number(asset.investedAmount);
          const invested = Number(asset.investedAmount);
          const gainLoss = asset.profitLoss ?? (currentValue - invested);
          const roi = invested > 0 ? (gainLoss / invested) * 100 : 0;
          enrichedAssets.push({
            assetId: asset.id,
            assetName: asset.name,
            platformId: platform.id,
            platformName: platform.name,
            platformMode: platform.platformMode,
            category: platform.category,
            assetCategory: asset.description ?? null,
            currentValue: Math.round(currentValue * 100) / 100,
            invested: Math.round(invested * 100) / 100,
            gainLoss: Math.round(gainLoss * 100) / 100,
            roi: Math.round(roi * 100) / 100,
            acquisitionDate: asset.acquisitionDate ?? null,
            exitDate: asset.exitDate ?? null,
          });
        }
      }

      res.json(enrichedAssets);
    } catch (error) {
      console.error("Error fetching analytics assets:", error);
      res.status(500).json({ message: "Failed to fetch analytics assets" });
    }
  });

  app.get('/api/analytics/platform-cashflows', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;

      const allInvestments = await storage.getAllInvestmentsForUser(userId);
      const allWithdrawals = await storage.getAllWithdrawalsForUser(userId);

      const map = new Map<number, { date: string; amount: number }[]>();

      for (const inv of allInvestments) {
        const cfs = map.get(inv.platformId) ?? [];
        cfs.push({ date: new Date(inv.date).toISOString(), amount: -(Number(inv.amount) || 0) });
        map.set(inv.platformId, cfs);
      }

      for (const wd of allWithdrawals) {
        const cfs = map.get(wd.platformId) ?? [];
        cfs.push({ date: new Date(wd.date).toISOString(), amount: Number(wd.amount) || 0 });
        map.set(wd.platformId, cfs);
      }

      const result = Array.from(map.entries()).map(([platformId, cashFlows]) => ({
        platformId,
        cashFlows: cashFlows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      }));

      res.json(result);
    } catch (error) {
      console.error("Error fetching platform cashflows:", error);
      res.status(500).json({ message: "Failed to fetch platform cashflows" });
    }
  });

  app.get('/api/platforms/:id/monthly-returns', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.id);
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });

      const platformValuations = await storage.getValuations(platformId);
      const platformInvestments = await storage.getInvestments(platformId);
      const platformWithdrawals = await storage.getWithdrawals(platformId);

      const toYM = (date: string | Date) => {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      };

      // Only include months that have actual valuation snapshots — avoids synthetic returns
      const valuationMonths = new Set<string>();
      platformValuations.forEach(v => valuationMonths.add(toYM(v.date)));

      const sortedMonths = Array.from(valuationMonths).sort();

      // For a given month, get the valuation closest to the 10th of that month.
      // Matches the same strategy used by the main dashboard heatmap so numbers
      // are consistent across the whole app.
      const getSnapshotNearTenth = (ym: string): { value: number; date: Date } => {
        const [year, month] = ym.split('-').map(Number);
        const tenth = new Date(year, month - 1, 10).getTime();
        if (platformValuations.length === 0) return { value: 0, date: new Date(tenth) };
        const closest = platformValuations.reduce((best, v) => {
          const dist = Math.abs(new Date(v.date).getTime() - tenth);
          const bestDist = Math.abs(new Date(best.date).getTime() - tenth);
          return dist < bestDist ? v : best;
        });
        return { value: Number(closest.value), date: new Date(closest.date) };
      };

      // Only count cash flows between two snapshot dates (exclusive of prevDate, inclusive of upTo)
      // This avoids charging deposits/withdrawals that happened AFTER the month's snapshot date
      const getNetCashBetween = (after: Date, upTo: Date): number => {
        const invested = platformInvestments
          .filter(i => new Date(i.date) > after && new Date(i.date) <= upTo)
          .reduce((s, i) => s + Number(i.amount), 0);
        const withdrawn = platformWithdrawals
          .filter(w => new Date(w.date) > after && new Date(w.date) <= upTo)
          .reduce((s, w) => s + Number(w.amount), 0);
        return invested - withdrawn;
      };

      const result: { month: string; prevVal: number; currVal: number; gain: number; gainPct: number | null }[] = [];
      const epoch = new Date(0);

      for (let i = 0; i < sortedMonths.length; i++) {
        const currYM = sortedMonths[i];
        const currSnap = getSnapshotNearTenth(currYM);

        const currVal = currSnap.value;
        const currDate = currSnap.date;

        // For the first month use prevVal=0 and epoch as prevDate so all pre-snapshot flows are included
        let prevVal = 0;
        let prevDate = epoch;
        if (i > 0) {
          const prevSnap = getSnapshotNearTenth(sortedMonths[i - 1]);
          prevVal = prevSnap.value;
          prevDate = prevSnap.date;
        }

        const netCash = getNetCashBetween(prevDate, currDate);
        const gain = currVal - prevVal - netCash;
        const gainPct = prevVal > 0 ? (gain / prevVal) * 100 : null;
        result.push({ month: currYM, prevVal, currVal, gain, gainPct });
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching platform monthly returns:", error);
      res.status(500).json({ message: "Failed to fetch monthly returns" });
    }
  });

  // --- Email Settings ---
  app.get("/api/email-settings", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    const settings = await storage.getEmailSettings(userId);
    if (settings) {
      const { imapPassword, ...safeSettings } = settings;
      res.json({ ...safeSettings, hasPassword: !!imapPassword });
    } else {
      res.json(null);
    }
  });

  app.post("/api/email-settings", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const { imapHost, imapPort, imapUser, imapPassword, imapTls, enabled } = req.body;
      
      if (!imapUser) {
        return res.status(400).json({ message: "Email address is required" });
      }
      
      const settings = await storage.saveEmailSettings(userId, {
        imapHost: imapHost || "imap.gmail.com",
        imapPort: imapPort || 993,
        imapUser,
        imapPassword,
        imapTls: imapTls ?? true,
        enabled: enabled ?? true,
      });
      
      const { imapPassword: pwd, ...safeSettings } = settings;
      res.json({ ...safeSettings, hasPassword: !!pwd });
    } catch (err) {
      console.error("Error saving email settings:", err);
      res.status(500).json({ message: "Failed to save email settings" });
    }
  });

  app.delete("/api/email-settings", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    await storage.deleteEmailSettings(userId);
    res.status(204).send();
  });

  app.post("/api/email-settings/poll", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    const { fetchEmailsForUser } = await import("./emailService");
    const result = await fetchEmailsForUser(userId);
    res.json(result);
  });

  // --- Email Imports ---
  app.get("/api/email-imports", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    const imports = await storage.getPendingEmailImports(userId);
    res.json(imports);
  });

  app.get("/api/email-imports/:id", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    const emailImport = await storage.getEmailImport(Number(req.params.id), userId);
    if (!emailImport) {
      return res.status(404).json({ message: "Import not found" });
    }
    res.json(emailImport);
  });

  app.patch("/api/email-imports/:id", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const id = Number(req.params.id);
      
      // First verify the import exists
      const existing = await storage.getEmailImport(id, userId);
      if (!existing) {
        return res.status(404).json({ message: "Import not found" });
      }
      
      // Build update object with only valid fields
      const updateData: Record<string, unknown> = {};
      if (req.body.transactionType !== undefined) updateData.transactionType = req.body.transactionType;
      if (req.body.parsedAmount !== undefined) updateData.parsedAmount = req.body.parsedAmount?.toString();
      if (req.body.parsedDate !== undefined) updateData.parsedDate = req.body.parsedDate ? new Date(req.body.parsedDate) : null;
      if (req.body.matchedPlatformId !== undefined) updateData.matchedPlatformId = req.body.matchedPlatformId;
      if (req.body.matchedAssetId !== undefined) updateData.matchedAssetId = req.body.matchedAssetId;
      if (req.body.parsedNotes !== undefined) updateData.parsedNotes = req.body.parsedNotes;
      
      const updated = await storage.updateEmailImport(id, userId, updateData);
      res.json(updated || existing);
    } catch (err) {
      console.error("Error updating email import:", err);
      res.status(500).json({ message: "Failed to update import" });
    }
  });

  app.post("/api/email-imports/:id/dismiss", requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    await storage.dismissEmailImport(Number(req.params.id), userId);
    res.status(204).send();
  });

  app.post("/api/email-imports/:id/approve", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const id = Number(req.params.id);
      const emailImport = await storage.getEmailImport(id, userId);
      
      if (!emailImport) {
        return res.status(404).json({ message: "Import not found" });
      }
      
      if (!emailImport.matchedPlatformId) {
        return res.status(400).json({ message: "Please select a platform before approving" });
      }
      
      const transactionType = emailImport.transactionType || "deposit";
      const amount = emailImport.parsedAmount?.toString() || "0";
      const date = emailImport.parsedDate || new Date();
      const notes = emailImport.parsedNotes || `Imported from email: ${emailImport.emailSubject}`;
      
      switch (transactionType) {
        case "deposit":
        case "purchase":
          if (transactionType === "purchase" && emailImport.matchedAssetId) {
            const asset = await storage.getAsset(emailImport.matchedAssetId);
            if (asset) {
              await storage.updateAsset(emailImport.matchedAssetId, {
                investedAmount: (Number(asset.investedAmount) + Number(amount)).toString()
              });
            }
          } else if (transactionType === "purchase" && emailImport.parsedAssetName) {
            await storage.createAsset({
              platformId: emailImport.matchedPlatformId,
              name: emailImport.parsedAssetName,
              investedAmount: amount,
              acquisitionDate: date,
              status: "active",
            });
          } else {
            await storage.createInvestment({
              platformId: emailImport.matchedPlatformId,
              amount,
              date,
              notes,
            });
          }
          break;
          
        case "withdrawal":
          await storage.createWithdrawal({
            platformId: emailImport.matchedPlatformId,
            amount,
            date,
            notes,
          });
          break;
          
        case "partial_exit":
          if (emailImport.matchedAssetId) {
            await storage.createAssetRepayment({
              assetId: emailImport.matchedAssetId,
              amount,
              date,
              notes,
            });
          }
          break;
          
        case "full_exit":
          if (emailImport.matchedAssetId) {
            await storage.exitAsset(emailImport.matchedAssetId, date, amount);
          }
          break;
          
        case "interest":
          await storage.createValuation({
            platformId: emailImport.matchedPlatformId,
            value: amount,
            date,
          });
          break;
      }
      
      await storage.approveEmailImport(id, userId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error approving email import:", err);
      res.status(500).json({ message: "Failed to approve import" });
    }
  });

  // === SCRAPER CONFIG ROUTES ===
  app.get('/api/platforms/:platformId/scraper-config', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });

      const config = await storage.getScraperConfig(platformId, userId);
      if (!config) return res.json(null);
      
      const safeConfig = { ...config, credentials: "***" };
      res.json(safeConfig);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch scraper config" });
    }
  });

  app.post('/api/platforms/:platformId/scraper-config', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });

      const { scraperType } = req.body;
      if (!scraperType) {
        return res.status(400).json({ message: "scraperType is required" });
      }

      let credentialData: Record<string, string>;

      if (scraperType === "stock_ticker") {
        const { ticker, shares, averagePrice, investedEur } = req.body;
        if (!ticker || !shares) {
          return res.status(400).json({ message: "ticker and shares are required for Stock Ticker" });
        }
        credentialData = { ticker: ticker.toUpperCase(), shares: String(normalizeEuropeanNumber(String(shares))) };
        if (averagePrice) credentialData.averagePrice = String(normalizeEuropeanNumber(String(averagePrice)));
        if (investedEur) credentialData.investedEur = String(normalizeEuropeanNumber(String(investedEur)));
      } else if (scraperType === "trading212") {
        const { apiKey, apiSecret, pieName } = req.body;
        if (!apiKey || !apiSecret) {
          return res.status(400).json({ message: "apiKey and apiSecret are required for Trading 212" });
        }
        credentialData = { apiKey, apiSecret };
        if (pieName) credentialData.pieName = pieName;
      } else if (scraperType === "goldrepublic") {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
          return res.status(400).json({ message: "username, email, and password are required for GoldRepublic" });
        }
        credentialData = { username, email, password };
      } else {
        const { email, password, gmailAppPassword, gmailEmail } = req.body;
        if (!email || !password) {
          return res.status(400).json({ message: "email and password are required" });
        }
        if (typeof email !== "string" || typeof password !== "string" || !email.includes("@")) {
          return res.status(400).json({ message: "Invalid email or password format" });
        }
        credentialData = { email, password };
        if (scraperType === "crowdpear") {
          if (gmailAppPassword) credentialData.gmailAppPassword = gmailAppPassword;
          if (gmailEmail) credentialData.gmailEmail = gmailEmail;
        }
      }

      const credentials = encrypt(JSON.stringify(credentialData));

      const config = await storage.saveScraperConfig({
        platformId,
        userId,
        scraperType,
        credentials,
        enabled: true,
      });

      res.json({ ...config, credentials: "***" });
    } catch (err) {
      console.error("Error saving scraper config:", err);
      res.status(500).json({ message: "Failed to save scraper config" });
    }
  });

  app.delete('/api/platforms/:platformId/scraper-config', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });

      await storage.deleteScraperConfig(platformId, userId);
      res.json({ message: "Scraper config deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete scraper config" });
    }
  });

  app.get('/api/platforms/:platformId/stock-info', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });

      const config = await storage.getScraperConfig(platformId, userId);
      if (!config || config.scraperType !== "stock_ticker") {
        return res.status(404).json({ message: "No stock ticker config found" });
      }

      let creds;
      try {
        const decrypted = decrypt(config.credentials);
        creds = JSON.parse(decrypted);
      } catch {
        try { creds = JSON.parse(config.credentials); } catch {
          return res.status(500).json({ message: "Failed to decrypt credentials" });
        }
      }

      const platform = await storage.getPlatform(platformId, userId);
      const targetCurrency = platform?.currency || "EUR";

      const { scrapeStockTicker } = await import("./scrapers/stock-ticker");
      const avgPrice = creds.averagePrice ? parseFloat(creds.averagePrice) : null;
      const investedEur = creds.investedEur ? parseFloat(creds.investedEur) : null;
      const result = await scrapeStockTicker(creds.ticker, parseFloat(creds.shares), targetCurrency, avgPrice, investedEur);

      res.json(result);
    } catch (err: any) {
      console.error("Stock info error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  function fmtValDiff(newVal: number, prevValNum: number | null, sym: string): string {
    if (prevValNum === null) return "";
    const diff = newVal - prevValNum;
    const sign = diff >= 0 ? "+" : "-";
    return ` (${sign}${sym}${Math.abs(diff).toFixed(2)})`;
  }

  app.post('/api/platforms/:platformId/scrape', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });

      const config = await storage.getScraperConfig(platformId, userId);
      if (!config) return res.status(404).json({ message: "No scraper configured for this platform" });

      let creds;
      try {
        const decrypted = decrypt(config.credentials);
        creds = JSON.parse(decrypted);
      } catch {
        try {
          creds = JSON.parse(config.credentials);
        } catch {
          return res.status(500).json({ message: "Failed to decrypt credentials. Please re-save your credentials." });
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const platform = await storage.getPlatform(platformId, userId);
      if (!platform) return res.status(404).json({ message: "Platform not found" });

      if (config.scraperType === "stock_ticker") {
        const { scrapeStockTicker } = await import("./scrapers/stock-ticker");
        const ticker = creds.ticker;
        const shares = parseFloat(creds.shares);
        const targetCurrency = platform!.currency || "EUR";

        if (!ticker || isNaN(shares)) {
          return res.status(400).json({ message: "Missing ticker or shares in configuration" });
        }

        const avgPrice = creds.averagePrice ? parseFloat(creds.averagePrice) : null;
        const investedEur = creds.investedEur ? parseFloat(creds.investedEur) : null;
        const result = await scrapeStockTicker(ticker, shares, targetCurrency, avgPrice, investedEur);
        const todayStr = today.toISOString().split("T")[0];
        let prevValNum: number | null = null;

        if (result.valueInTargetCurrency > 0) {
          const existingVals = await storage.getValuations(platformId);
          const prevVal = existingVals.find(v => new Date(v.date).toISOString().split("T")[0] !== todayStr);
          if (prevVal) prevValNum = parseFloat(prevVal.value);
          const sameDayVal = existingVals.find(v =>
            new Date(v.date).toISOString().split("T")[0] === todayStr
          );
          if (sameDayVal) {
            await storage.updateValuation(sameDayVal.id, { value: result.valueInTargetCurrency.toFixed(2) });
          } else {
            await storage.createValuation({
              platformId,
              value: result.valueInTargetCurrency.toFixed(2),
              date: today,
            });
          }
        }

        const sym = (c: string) => ({ EUR: "€", USD: "$", GBP: "£" }[c] || c + " ");
        const currSym = sym(targetCurrency);
        await storage.updateScraperConfig(config.id, userId, {
          lastScrapeAt: new Date(),
          lastScrapeStatus: "success",
          lastScrapeMessage: `${ticker}: ${shares} shares × $${result.stockPrice.toFixed(2)} = $${result.valueInStockCurrency.toFixed(2)} (FX ${result.fxRate.toFixed(4)}) = ${currSym}${result.valueInTargetCurrency.toFixed(2)}`,
        });

        return res.json({
          success: true,
          data: result,
          message: `${ticker}: ${shares} shares × $${result.stockPrice.toFixed(2)} = ${currSym}${result.valueInTargetCurrency.toFixed(2)}${fmtValDiff(result.valueInTargetCurrency, prevValNum, currSym)}`,
        });
      }

      if (config.scraperType === "trading212") {
        if (!creds.apiKey || !creds.apiSecret) {
          return res.status(400).json({ message: "Missing API key or secret. Please re-save your Trading 212 credentials." });
        }

        const todayStr = today.toISOString().split("T")[0];

        const { scrapeTrading212 } = await import("./scrapers/trading212");
        const pieName = creds.pieName || "";
        const t212Data = await scrapeTrading212(creds.apiKey, creds.apiSecret, { filterPieName: pieName, platformName: platform!.name });
        const matchedPie = t212Data.pies.find(p => {
          if (pieName) {
            return p.pieName.toLowerCase().includes(pieName.toLowerCase()) ||
                   pieName.toLowerCase().includes(p.pieName.toLowerCase());
          }
          return p.pieName.toLowerCase().includes(platform!.name.toLowerCase()) ||
                 platform!.name.toLowerCase().includes(p.pieName.toLowerCase());
        });

        if (!matchedPie) {
          const availablePies = t212Data.pies.map(p => p.pieName).join(", ");
          await storage.updateScraperConfig(config.id, userId, {
            lastScrapeAt: new Date(),
            lastScrapeStatus: "error",
            lastScrapeMessage: `No matching pie found. Available pies: ${availablePies}`,
          });
          return res.status(400).json({
            message: `No matching pie found for "${pieName || platform!.name}". Available pies: ${availablePies}`,
          });
        }

        const totalValue = matchedPie.currentValue;
        let prevValNum: number | null = null;
        if (totalValue > 0) {
          const existingVals = await storage.getValuations(platformId);
          const prevVal = existingVals.find(v => new Date(v.date).toISOString().split("T")[0] !== todayStr);
          if (prevVal) prevValNum = parseFloat(prevVal.value);
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
            const adj = existingSyncAdj[existingSyncAdj.length - 1];
            const currentAdjAmount = parseFloat(adj.amount);
            if (Math.abs(diff - currentAdjAmount) >= 0.01) {
              await storage.updateInvestment(adj.id, {
                amount: diff.toFixed(2),
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

        await storage.updateScraperConfig(config.id, userId, {
          lastScrapeAt: new Date(),
          lastScrapeStatus: "success",
          lastScrapeMessage: `Pie "${matchedPie.pieName}": Value=${totalValue.toFixed(2)}, Invested=${matchedPie.investedValue.toFixed(2)}, P/L=${matchedPie.result.toFixed(2)} (${matchedPie.resultPercent.toFixed(1)}%)`,
        });

        const t212Sym = ({ EUR: "€", USD: "$", GBP: "£" }[platform!.currency || "EUR"] || (platform!.currency || "EUR") + " ");
        return res.json({
          success: true,
          data: matchedPie,
          message: `Synced "${matchedPie.pieName}": Value=${t212Sym}${totalValue.toFixed(2)}${fmtValDiff(totalValue, prevValNum, t212Sym)}, Invested=${t212Sym}${matchedPie.investedValue.toFixed(2)}`,
        });
      }

      if (config.scraperType === "robocash" || config.scraperType === "crowdpear" || config.scraperType === "goldrepublic" || config.scraperType === "valvest" || config.scraperType === "lande") {
        let balanceData: { totalBalance: number; totalInvested?: number | null; scrapedAt: Date };
        if (config.scraperType === "robocash") {
          const { scrapeRoboCash } = await import("./scrapers/robocash");
          balanceData = await scrapeRoboCash(creds.email, creds.password);
        } else if (config.scraperType === "goldrepublic") {
          const { scrapeGoldRepublic } = await import("./scrapers/goldrepublic");
          balanceData = await scrapeGoldRepublic(creds.username, creds.email, creds.password);
        } else if (config.scraperType === "valvest") {
          const { scrapeValvest } = await import("./scrapers/valvest");
          balanceData = await scrapeValvest(creds.email, creds.password);
        } else if (config.scraperType === "lande") {
          const { scrapeLande } = await import("./scrapers/lande");
          balanceData = await scrapeLande(creds.cookies);
        } else {
          const { scrapeCrowdPear } = await import("./scrapers/crowdpear");
          balanceData = await scrapeCrowdPear(creds.email, creds.password, creds.gmailAppPassword, creds.gmailEmail);
        }

        const todayStr = today.toISOString().split("T")[0];
        let prevValNum: number | null = null;
        if (balanceData.totalBalance > 0) {
          const existingVals = await storage.getValuations(platformId);
          const prevVal = existingVals.find(v => new Date(v.date).toISOString().split("T")[0] !== todayStr);
          if (prevVal) prevValNum = parseFloat(prevVal.value);
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

        if (balanceData.totalInvested && balanceData.totalInvested > 0) {
          const existingInvestments = await storage.getInvestments(platformId);
          const totalExisting = existingInvestments.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
          const diff = Math.round((balanceData.totalInvested - totalExisting) * 100) / 100;
          if (Math.abs(diff) >= 0.01) {
            if (diff > 0) {
              await storage.createInvestment({
                platformId,
                amount: diff.toFixed(2),
                date: today,
                notes: `Auto-adjusted from GoldRepublic (total invested: €${balanceData.totalInvested.toFixed(2)})`,
              });
              console.log(`[GoldRepublic] Added investment adjustment of €${diff.toFixed(2)} to match scraped total of €${balanceData.totalInvested.toFixed(2)}`);
            } else {
              console.log(`[GoldRepublic] Scraped total invested (€${balanceData.totalInvested.toFixed(2)}) is less than recorded (€${totalExisting.toFixed(2)}). Manual review needed.`);
            }
          }
        }

        const platSym = ({ EUR: "€", USD: "$", GBP: "£" }[platform!.currency || "EUR"] || (platform!.currency || "EUR") + " ");
        const msgParts = [`Total: ${platSym}${balanceData.totalBalance.toFixed(2)}${fmtValDiff(balanceData.totalBalance, prevValNum, platSym)}`];
        if (balanceData.totalInvested) {
          msgParts.push(`Invested: ${platSym}${balanceData.totalInvested.toFixed(2)}`);
        }

        await storage.updateScraperConfig(config.id, userId, {
          lastScrapeAt: new Date(),
          lastScrapeStatus: "success",
          lastScrapeMessage: msgParts.join(", "),
        });

        return res.json({
          success: true,
          data: balanceData,
          message: msgParts.join(", "),
        });
      }

      let scraperResult;
      if (config.scraperType === "monefit") {
        const { scrapeMonefit } = await import("./scrapers/monefit");
        scraperResult = await scrapeMonefit(creds.email, creds.password);
      } else {
        return res.status(400).json({ message: `Unknown scraper type: ${config.scraperType}` });
      }

      let monefitPrevValNum: number | null = null;
      if (scraperResult.totalBalance > 0) {
        const existingVals = await storage.getValuations(platformId);
        const todayStr = today.toISOString().split("T")[0];
        const prevVal = existingVals.find(v => new Date(v.date).toISOString().split("T")[0] !== todayStr);
        if (prevVal) monefitPrevValNum = parseFloat(prevVal.value);
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
        const todayStr = today.toISOString().split("T")[0];
        
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

      await storage.updateScraperConfig(config.id, userId, {
        lastScrapeAt: new Date(),
        lastScrapeStatus: "success",
        lastScrapeMessage: `Total: €${scraperResult.totalBalance.toFixed(2)}, Invested: €${scraperResult.totalInvested.toFixed(2)}, Vaults: ${scraperResult.vaults.length}`,
      });

      const monefitSym = ({ EUR: "€", USD: "$", GBP: "£" }[platform.currency || "EUR"] || (platform.currency || "EUR") + " ");
      res.json({
        success: true,
        data: scraperResult,
        message: `Total: ${monefitSym}${scraperResult.totalBalance.toFixed(2)}${fmtValDiff(scraperResult.totalBalance, monefitPrevValNum, monefitSym)}, Invested: ${monefitSym}${scraperResult.totalInvested.toFixed(2)}`,
      });
    } catch (err: any) {
      console.error("Scrape error:", err);
      
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const config = await storage.getScraperConfig(platformId, userId);
      if (config) {
        await storage.updateScraperConfig(config.id, userId, {
          lastScrapeAt: new Date(),
          lastScrapeStatus: "error",
          lastScrapeMessage: err.message || "Unknown error",
        });
      }
      
      res.status(500).json({ message: err.message || "Scraping failed" });
    }
  });

  app.post('/api/scrape-all', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const configs = await storage.getScraperConfigsByUser(userId);
      if (!configs || configs.length === 0) {
        return res.json({ results: [], message: "No scraper configurations found" });
      }

      const results: { platformId: number; platformName: string; success: boolean; message: string }[] = [];

      for (const config of configs) {
        const platform = await storage.getPlatform(config.platformId, userId);
        if (!platform) continue;

        try {
          const scrapeRes = await fetch(`http://localhost:${process.env.PORT || 5000}/api/platforms/${config.platformId}/scrape`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': req.headers.cookie || '',
            },
          });
          const data = await scrapeRes.json();
          results.push({
            platformId: config.platformId,
            platformName: platform.name,
            success: scrapeRes.ok,
            message: data.message || (scrapeRes.ok ? "Success" : "Failed"),
          });
        } catch (err: any) {
          results.push({
            platformId: config.platformId,
            platformName: platform.name,
            success: false,
            message: err.message || "Failed",
          });
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Scrape all failed" });
    }
  });

  app.get('/api/scraper-configs', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const configs = await storage.getScraperConfigsByUser(userId);
      const results = [];
      for (const config of configs) {
        const platform = await storage.getPlatform(config.platformId, userId);
        if (platform) {
          results.push({ platformId: config.platformId, platformName: platform.name, lastScrapeAt: config.lastScrapeAt });
        }
      }
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const tickerChartCache = new Map<string, { data: any; timestamp: number }>();
  const TICKER_CHART_CACHE_TTL = 4 * 60 * 60 * 1000;

  function mapT212TickerToYahoo(rawTicker: string): string {
    let ticker = rawTicker.replace(/_EQ$/, "");
    if (ticker.endsWith("_US")) {
      const sym = ticker.replace(/_US$/, "");
      return sym.replace(/_/g, "-");
    }
    if (ticker.endsWith("l")) {
      return ticker.slice(0, -1) + ".L";
    }
    if (ticker.endsWith("_DE")) {
      return ticker.replace(/_DE$/, "") + ".DE";
    }
    if (ticker.endsWith("_NL")) {
      return ticker.replace(/_NL$/, "") + ".AS";
    }
    return ticker.replace(/_/g, "-");
  }

  app.get('/api/ticker-chart/:ticker', requireAuth, async (req, res) => {
    try {
      const rawTicker = req.params.ticker;
      const cached = tickerChartCache.get(rawTicker);
      if (cached && Date.now() - cached.timestamp < TICKER_CHART_CACHE_TTL) {
        return res.json(cached.data);
      }

      const yahooSymbol = mapT212TickerToYahoo(rawTicker);
      const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=3mo`;

      const response = await fetch(yfUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        return res.json({ prices: [], symbol: yahooSymbol, error: "Could not fetch data from Yahoo Finance" });
      }

      const data = await response.json() as any;
      const chart = data?.chart?.result?.[0];
      if (!chart || !chart.timestamp || !chart.indicators?.quote?.[0]) {
        return res.json({ prices: [], symbol: yahooSymbol, error: "No data available" });
      }

      const timestamps = chart.timestamp as number[];
      const closes = chart.indicators.quote[0].close as (number | null)[];
      const prices: { date: string; close: number }[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const close = closes[i];
        if (close != null && !isNaN(close)) {
          const d = new Date(timestamps[i] * 1000);
          prices.push({
            date: d.toISOString().split('T')[0],
            close: Math.round(close * 100) / 100,
          });
        }
      }

      const result = { prices, symbol: yahooSymbol, currency: chart.meta?.currency || "USD" };
      tickerChartCache.set(rawTicker, { data: result, timestamp: Date.now() });
      res.json(result);
    } catch (err: any) {
      console.error("Ticker chart error:", err.message);
      res.json({ prices: [], error: err.message });
    }
  });

  const tickerNamesCache = new Map<string, string>();

  app.get('/api/tickers/names', requireAuth, async (req, res) => {
    try {
      const rawTickers = (req.query.tickers as string || '').split(',').map(t => t.trim()).filter(Boolean);
      if (rawTickers.length === 0) return res.json({});

      const result: Record<string, string> = {};
      const toFetch: string[] = [];

      for (const ticker of rawTickers) {
        if (tickerNamesCache.has(ticker)) {
          result[ticker] = tickerNamesCache.get(ticker)!;
        } else {
          toFetch.push(ticker);
        }
      }

      await Promise.all(toFetch.map(async (ticker) => {
        try {
          const yahooSymbol = mapT212TickerToYahoo(ticker);
          const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
          const response = await fetch(yfUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          });
          if (!response.ok) return;
          const data = await response.json() as any;
          const meta = data?.chart?.result?.[0]?.meta;
          const name = meta?.longName || meta?.shortName;
          if (name) {
            tickerNamesCache.set(ticker, name);
            result[ticker] = name;
          }
        } catch (_) {}
      }));

      res.json(result);
    } catch (err: any) {
      console.error("Ticker names error:", err.message);
      res.json({});
    }
  });

  const holdingsCache = new Map<string, { data: any; timestamp: number }>();
  const HOLDINGS_CACHE_TTL = 5 * 60 * 1000;

  app.get('/api/platforms/:platformId/trading212-holdings-stream', requireAuth, async (req, res) => {
    const userId = getAuthenticatedUserId(req)!;
    const platformId = Number(req.params.platformId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let clientDisconnected = false;
    req.on('close', () => { clientDisconnected = true; });

    const sendEvent = (type: string, data: any) => {
      if (clientDisconnected) return;
      try {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      } catch (e) {}
    };

    try {
      const config = await storage.getScraperConfig(platformId, userId);
      if (!config || config.scraperType !== "trading212") {
        sendEvent("error", { message: "No Trading 212 configuration found" });
        res.end();
        return;
      }

      const platform = await storage.getPlatform(platformId, userId);
      if (!platform) {
        sendEvent("error", { message: "Platform not found" });
        res.end();
        return;
      }

      const creds = JSON.parse(decrypt(config.credentials));
      if (!creds.apiKey || !creds.apiSecret) {
        sendEvent("error", { message: "Missing API credentials" });
        res.end();
        return;
      }

      const onProgress = (message: string) => {
        sendEvent("progress", { message });
      };

      const { scrapeTrading212WithPositions } = await import("./scrapers/trading212");

      const dbDividends = await storage.getTrading212Dividends(platformId, userId);
      const hasDbDividends = dbDividends.length > 0;

      const pieName = creds.pieName || "";
      const t212Data = await scrapeTrading212WithPositions(creds.apiKey, creds.apiSecret, {
        skipDividends: hasDbDividends,
        filterPieName: pieName,
        platformName: platform.name,
        onProgress,
      });

      const matchedPie = t212Data.pies.find(p => {
        if (pieName) {
          return p.pieName.toLowerCase().includes(pieName.toLowerCase()) ||
                 pieName.toLowerCase().includes(p.pieName.toLowerCase());
        }
        return p.pieName.toLowerCase().includes(platform.name.toLowerCase()) ||
               platform.name.toLowerCase().includes(p.pieName.toLowerCase());
      });

      if (!matchedPie) {
        sendEvent("error", { message: "No matching pie found" });
        res.end();
        return;
      }

      sendEvent("progress", { message: "Processing data..." });

      if (t212Data.dividendsLoaded && t212Data.rawDividends && t212Data.rawDividends.size > 0) {
        try {
          const pieTickers = new Set(matchedPie.instruments.map(i => i.ticker));
          const pieDivRecords: { ticker: string; amount: string; paidOn: string; quantity: string | null }[] = [];
          t212Data.rawDividends.forEach((data, ticker) => {
            if (!pieTickers.has(ticker)) return;
            for (const record of data.history) {
              pieDivRecords.push({
                ticker,
                amount: record.amount.toString(),
                paidOn: record.paidOn,
                quantity: record.quantity != null ? record.quantity.toString() : null,
              });
            }
          });
          await storage.saveTrading212Dividends(platformId, userId, pieDivRecords);
          sendEvent("progress", { message: `Saved ${pieDivRecords.length} dividend records` });
        } catch (divSaveErr: any) {
          console.error("T212 dividend save error:", divSaveErr.message);
        }
      }

      const needDbDividendFallback = !t212Data.dividendsLoaded || (t212Data.dividendsLoaded && (!t212Data.rawDividends || t212Data.rawDividends.size === 0));
      const dividendsAlreadyOnInstruments = matchedPie.instruments.some(i => i.dividendsReceived != null && i.dividendsReceived > 0);
      if (needDbDividendFallback && !dividendsAlreadyOnInstruments && hasDbDividends) {
        const divMap = new Map<string, { total: number; count: number; lastDate: string; history: { amount: number; paidOn: string; quantity: number }[] }>();
        for (const row of dbDividends) {
          if (row.paidOn < DIVIDEND_START) continue;
          const existing = divMap.get(row.ticker);
          const amt = Number(row.amount);
          const qty = row.quantity ? Number(row.quantity) : 0;
          const record = { amount: amt, paidOn: row.paidOn, quantity: qty };
          if (existing) {
            existing.total += amt;
            existing.count += 1;
            existing.history.push(record);
            if (row.paidOn > existing.lastDate) existing.lastDate = row.paidOn;
          } else {
            divMap.set(row.ticker, { total: amt, count: 1, lastDate: row.paidOn, history: [record] });
          }
        }
        for (const inst of matchedPie.instruments) {
          const div = divMap.get(inst.ticker);
          if (div) {
            inst.dividendsReceived = div.total;
            inst.dividendCount = div.count;
            inst.lastDividendDate = div.lastDate;
            inst.dividendHistory = div.history;
          }
        }
      }
      for (const inst of matchedPie.instruments) {
        if (!inst.dividendHistory) continue;
        inst.dividendHistory = inst.dividendHistory.filter((d: any) => d.paidOn >= DIVIDEND_START);
        if (inst.dividendHistory.length === 0) {
          inst.dividendsReceived = null;
          inst.dividendCount = null;
          inst.lastDividendDate = null;
        } else {
          inst.dividendsReceived = inst.dividendHistory.reduce((s: number, d: any) => s + d.amount, 0);
          inst.dividendCount = inst.dividendHistory.length;
          inst.lastDividendDate = inst.dividendHistory.reduce((latest: string, d: any) => d.paidOn > latest ? d.paidOn : latest, inst.dividendHistory[0].paidOn);
        }
      }

      sendEvent("progress", { message: "Saving holdings snapshot..." });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      try {
        const toNumStr = (v: any): string | null => {
          if (v == null) return null;
          if (typeof v === 'object') return null;
          const n = Number(v);
          return isNaN(n) ? null : n.toString();
        };
        const holdingsToSave = matchedPie.instruments.map(inst => {
          const qty = inst.quantity ?? inst.shares;
          const val = qty && inst.currentPrice ? (qty * inst.currentPrice) : null;
          return {
            ticker: inst.ticker,
            shares: toNumStr(inst.quantity ?? inst.shares),
            currentPrice: toNumStr(inst.currentPrice),
            averagePrice: toNumStr(inst.averagePrice),
            value: val != null ? val.toFixed(2) : null,
            ppl: toNumStr(inst.ppl),
            currentShare: toNumStr(inst.currentShare),
            expectedShare: toNumStr(inst.expectedShare),
            result: toNumStr(inst.result),
          };
        });
        await storage.saveTrading212Holdings(platformId, userId, today, holdingsToSave);
      } catch (saveErr: any) {
        console.error("T212 holdings snapshot save error:", saveErr.message);
      }

      const instruments = matchedPie.instruments;
      const totalValue = instruments.reduce((sum, i) => {
        const qty = i.quantity ?? i.shares ?? 0;
        const price = i.currentPrice ?? 0;
        return sum + qty * price;
      }, 0);
      const totalInvested = instruments.reduce((sum, i) => {
        const qty = i.quantity ?? i.shares ?? 0;
        const avgPrice = i.averagePrice ?? 0;
        return sum + qty * avgPrice;
      }, 0);
      const totalResult = instruments.reduce((sum, i) => sum + (i.ppl ?? 0), 0);

      sendEvent("complete", {
        message: "Done!",
        data: {
          pieName: matchedPie.pieName,
          currentValue: totalValue,
          investedValue: totalInvested,
          cash: matchedPie.cash,
          result: totalResult,
          resultPercent: totalInvested > 0 ? (totalResult / totalInvested) * 100 : 0,
          dividendsGained: matchedPie.dividendsGained,
          dividendsReinvested: matchedPie.dividendsReinvested,
          dividendsInCash: matchedPie.dividendsInCash,
          instruments,
        }
      });
      res.end();
    } catch (err: any) {
      console.error("T212 holdings stream error:", err);
      sendEvent("error", { message: err.message || "Failed to fetch holdings" });
      res.end();
    }
  });

  app.get('/api/platforms/:platformId/trading212-holdings', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const forceRefresh = req.query.refresh === "true";

      const config = await storage.getScraperConfig(platformId, userId);
      if (!config || config.scraperType !== "trading212") {
        return res.status(404).json({ message: "No Trading 212 configuration found for this platform" });
      }

      const platform = await storage.getPlatform(platformId, userId);
      if (!platform) return res.status(404).json({ message: "Platform not found" });

      if (!forceRefresh) {
        const latestHoldings = await storage.getTrading212Holdings(platformId, userId);
        const dbDividends = await storage.getTrading212Dividends(platformId, userId);

        if (latestHoldings.length > 0) {
          const latestDate = latestHoldings[0].date;
          const snapshotHoldings = latestHoldings.filter(h =>
            new Date(h.date).getTime() === new Date(latestDate).getTime()
          );

          const divMap = new Map<string, { total: number; count: number; lastDate: string; history: { amount: number; paidOn: string; quantity: number }[] }>();
          for (const row of dbDividends) {
            if (row.paidOn < DIVIDEND_START) continue;
            const existing = divMap.get(row.ticker);
            const amt = Number(row.amount);
            const qty = row.quantity ? Number(row.quantity) : 0;
            const record = { amount: amt, paidOn: row.paidOn, quantity: qty };
            if (existing) {
              existing.total += amt;
              existing.count += 1;
              existing.history.push(record);
              if (row.paidOn > existing.lastDate) existing.lastDate = row.paidOn;
            } else {
              divMap.set(row.ticker, { total: amt, count: 1, lastDate: row.paidOn, history: [record] });
            }
          }

          const instruments = snapshotHoldings.map(h => {
            const div = divMap.get(h.ticker);
            return {
              ticker: h.ticker,
              shares: h.shares ? Number(h.shares) : null,
              quantity: h.shares ? Number(h.shares) : null,
              currentPrice: h.currentPrice ? Number(h.currentPrice) : null,
              averagePrice: h.averagePrice ? Number(h.averagePrice) : null,
              ppl: h.ppl ? Number(h.ppl) : null,
              currentShare: h.currentShare ? Number(h.currentShare) : null,
              expectedShare: h.expectedShare ? Number(h.expectedShare) : null,
              result: h.result ? Number(h.result) : null,
              dividendsReceived: div ? div.total : null,
              dividendCount: div ? div.count : null,
              lastDividendDate: div ? div.lastDate : null,
              dividendHistory: div ? div.history : null,
            };
          });

          const totalValue = instruments.reduce((sum, i) => {
            const qty = i.shares ?? 0;
            const price = i.currentPrice ?? 0;
            return sum + qty * price;
          }, 0);

          const totalInvested = instruments.reduce((sum, i) => {
            const qty = i.shares ?? 0;
            const avgPrice = i.averagePrice ?? 0;
            return sum + qty * avgPrice;
          }, 0);

          const totalResult = instruments.reduce((sum, i) => sum + (i.ppl ?? 0), 0);

          const creds = JSON.parse(decrypt(config.credentials));
          let totalDividendsGained = 0;
          for (const [, div] of divMap) totalDividendsGained += div.total;
          const responseData = {
            pieName: creds.pieName || platform.name,
            currentValue: totalValue,
            investedValue: totalInvested,
            cash: 0,
            result: totalResult,
            resultPercent: totalInvested > 0 ? (totalResult / totalInvested) * 100 : 0,
            dividendsGained: totalDividendsGained,
            dividendsReinvested: null,
            dividendsInCash: null,
            instruments,
            fromDb: true,
          };

          return res.json(responseData);
        }
      }

      const creds = JSON.parse(decrypt(config.credentials));
      if (!creds.apiKey || !creds.apiSecret) {
        return res.status(400).json({ message: "Missing API credentials" });
      }

      const { scrapeTrading212WithPositions } = await import("./scrapers/trading212");

      const dbDividends = await storage.getTrading212Dividends(platformId, userId);
      const hasDbDividends = dbDividends.length > 0;
      const shouldFetchDividends = forceRefresh || !hasDbDividends;

      const pieName = creds.pieName || "";
      const t212Data = await scrapeTrading212WithPositions(creds.apiKey, creds.apiSecret, {
        skipDividends: !shouldFetchDividends,
        filterPieName: pieName,
        platformName: platform.name,
      });
      const matchedPie = t212Data.pies.find(p => {
        if (pieName) {
          return p.pieName.toLowerCase().includes(pieName.toLowerCase()) ||
                 pieName.toLowerCase().includes(p.pieName.toLowerCase());
        }
        return p.pieName.toLowerCase().includes(platform.name.toLowerCase()) ||
               platform.name.toLowerCase().includes(p.pieName.toLowerCase());
      });

      if (!matchedPie) {
        return res.status(404).json({ message: "No matching pie found" });
      }

      if (t212Data.dividendsLoaded && t212Data.rawDividends && t212Data.rawDividends.size > 0) {
        try {
          const pieTickers = new Set(matchedPie.instruments.map(i => i.ticker));
          const pieDivRecords: { ticker: string; amount: string; paidOn: string; quantity: string | null }[] = [];
          t212Data.rawDividends.forEach((data, ticker) => {
            if (!pieTickers.has(ticker)) return;
            for (const record of data.history) {
              pieDivRecords.push({
                ticker,
                amount: record.amount.toString(),
                paidOn: record.paidOn,
                quantity: record.quantity != null ? record.quantity.toString() : null,
              });
            }
          });
          await storage.saveTrading212Dividends(platformId, userId, pieDivRecords);
          console.log(`[Trading212] Saved ${pieDivRecords.length} dividend records (filtered to ${pieTickers.size} pie tickers) to DB`);
        } catch (divSaveErr: any) {
          console.error("T212 dividend save error:", divSaveErr.message);
        }
      }

      const needDbDividendFallback = !t212Data.dividendsLoaded || (t212Data.dividendsLoaded && (!t212Data.rawDividends || t212Data.rawDividends.size === 0));
      const dividendsAlreadyOnInstruments = matchedPie.instruments.some(i => i.dividendsReceived != null && i.dividendsReceived > 0);
      if (needDbDividendFallback && !dividendsAlreadyOnInstruments && hasDbDividends) {
        const divMap = new Map<string, { total: number; count: number; lastDate: string; history: { amount: number; paidOn: string; quantity: number }[] }>();
        for (const row of dbDividends) {
          if (row.paidOn < DIVIDEND_START) continue;
          const existing = divMap.get(row.ticker);
          const amt = Number(row.amount);
          const qty = row.quantity ? Number(row.quantity) : 0;
          const record = { amount: amt, paidOn: row.paidOn, quantity: qty };
          if (existing) {
            existing.total += amt;
            existing.count += 1;
            existing.history.push(record);
            if (row.paidOn > existing.lastDate) existing.lastDate = row.paidOn;
          } else {
            divMap.set(row.ticker, { total: amt, count: 1, lastDate: row.paidOn, history: [record] });
          }
        }
        for (const inst of matchedPie.instruments) {
          const div = divMap.get(inst.ticker);
          if (div) {
            inst.dividendsReceived = div.total;
            inst.dividendCount = div.count;
            inst.lastDividendDate = div.lastDate;
            inst.dividendHistory = div.history;
          }
        }
      }
      for (const inst of matchedPie.instruments) {
        if (!inst.dividendHistory) continue;
        inst.dividendHistory = inst.dividendHistory.filter((d: any) => d.paidOn >= DIVIDEND_START);
        if (inst.dividendHistory.length === 0) {
          inst.dividendsReceived = null;
          inst.dividendCount = null;
          inst.lastDividendDate = null;
        } else {
          inst.dividendsReceived = inst.dividendHistory.reduce((s: number, d: any) => s + d.amount, 0);
          inst.dividendCount = inst.dividendHistory.length;
          inst.lastDividendDate = inst.dividendHistory.reduce((latest: string, d: any) => d.paidOn > latest ? d.paidOn : latest, inst.dividendHistory[0].paidOn);
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      try {
        const toNumStr = (v: any): string | null => {
          if (v == null) return null;
          if (typeof v === 'object') return null;
          const n = Number(v);
          return isNaN(n) ? null : n.toString();
        };
        const holdingsToSave = matchedPie.instruments.map(inst => {
          const qty = inst.quantity ?? inst.shares;
          const val = qty && inst.currentPrice ? (qty * inst.currentPrice) : null;
          return {
            ticker: inst.ticker,
            shares: toNumStr(inst.quantity ?? inst.shares),
            currentPrice: toNumStr(inst.currentPrice),
            averagePrice: toNumStr(inst.averagePrice),
            value: val != null ? val.toFixed(2) : null,
            ppl: toNumStr(inst.ppl),
            currentShare: toNumStr(inst.currentShare),
            expectedShare: toNumStr(inst.expectedShare),
            result: toNumStr(inst.result),
          };
        });
        await storage.saveTrading212Holdings(platformId, userId, today, holdingsToSave);
      } catch (saveErr: any) {
        console.error("T212 holdings snapshot save error:", saveErr.message);
      }

      const responseData = {
        pieName: matchedPie.pieName,
        currentValue: matchedPie.currentValue,
        investedValue: matchedPie.investedValue,
        cash: matchedPie.cash,
        result: matchedPie.result,
        resultPercent: matchedPie.resultPercent,
        dividendsGained: matchedPie.dividendsGained,
        dividendsReinvested: matchedPie.dividendsReinvested,
        dividendsInCash: matchedPie.dividendsInCash,
        instruments: matchedPie.instruments,
      };

      holdingsCache.set(`${userId}:${platformId}`, { data: responseData, timestamp: Date.now() });

      res.json(responseData);
    } catch (err: any) {
      console.error("T212 holdings error:", err);
      res.status(500).json({ message: err.message || "Failed to fetch holdings" });
    }
  });

  app.get('/api/platforms/:platformId/dividend-calendar', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);

      const config = await storage.getScraperConfig(platformId, userId);
      if (!config || config.scraperType !== "trading212") {
        return res.status(404).json({ message: "No Trading 212 configuration found for this platform" });
      }

      const [allDividends, latestHoldings, fmpData] = await Promise.all([
        storage.getTrading212Dividends(platformId, userId),
        storage.getTrading212Holdings(platformId, userId),
        getFmpDividendCalendar(),
      ]);

      const payments = allDividends
        .filter(d => d.paidOn >= DIVIDEND_START)
        .map(d => ({
          ticker: d.ticker,
          amount: Number(d.amount),
          paidOn: d.paidOn,
          quantity: d.quantity ? Number(d.quantity) : null,
        }));

      const heldTickers: string[] = [];
      if (latestHoldings.length > 0) {
        const latestDate = latestHoldings[0].date;
        latestHoldings
          .filter(h => new Date(h.date).getTime() === new Date(latestDate).getTime())
          .forEach(h => heldTickers.push(h.ticker));
      }

      // Build projections: FMP declared dates take priority; pattern fallback for the rest
      const hasFmpKey = !!process.env.FMP_API_KEY;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const maxDate = new Date(today);
      maxDate.setMonth(maxDate.getMonth() + 6);

      const byTicker = new Map<string, typeof payments>();
      for (const p of payments) {
        if (!byTicker.has(p.ticker)) byTicker.set(p.ticker, []);
        byTicker.get(p.ticker)!.push(p);
      }

      const projections: { ticker: string; amount: number; date: string; frequency: string; source: "declared" | "estimated" }[] = [];

      for (const ticker of heldTickers) {
        const history = byTicker.get(ticker) || [];
        const sorted = [...history].sort((a, b) => a.paidOn.slice(0, 10).localeCompare(b.paidOn.slice(0, 10)));
        const recent = sorted.slice(-4);
        const avgAmount = recent.length > 0 ? recent.reduce((s, h) => s + h.amount, 0) / recent.length : 0;

        const normalizedSym = normalizeTicker(ticker);
        const fmpDates = fmpData.get(normalizedSym);

        if (fmpDates && fmpDates.length > 0) {
          for (const payDate of fmpDates) {
            const d = new Date(payDate);
            if (d > today && d <= maxDate) {
              projections.push({ ticker, amount: avgAmount, date: payDate, frequency: "declared", source: "declared" });
            }
          }
        } else if (sorted.length >= 2) {
          const dates = sorted.map(h => h.paidOn.slice(0, 10));
          const { label, days } = detectFrequencyFmp(dates);
          const lastDate = new Date(dates[dates.length - 1]);
          let next = new Date(lastDate);
          next.setDate(next.getDate() + days);
          let count = 0;
          while (count < 3 && next <= maxDate) {
            if (next > today) {
              projections.push({ ticker, amount: avgAmount, date: next.toISOString().slice(0, 10), frequency: label, source: "estimated" });
              count++;
            }
            const n2 = new Date(next);
            n2.setDate(n2.getDate() + days);
            next = n2;
          }
        }
      }

      res.json({ payments, projections, hasFmpKey });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/platforms/:platformId/trading212-holdings-history', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });

      const date = req.query.date as string | undefined;
      if (date) {
        const holdings = await storage.getTrading212HoldingsByDate(platformId, userId, date);
        return res.json({ date, holdings });
      }

      const dates = await storage.getTrading212HoldingsDates(platformId, userId);
      res.json({ dates });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch holdings history" });
    }
  });

  app.get('/api/platforms/:platformId/trading212-holdings-chart', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const platformId = Number(req.params.platformId);
      const isOwner = await storage.verifyPlatformOwnership(platformId, userId);
      if (!isOwner) return res.status(404).json({ message: "Platform not found" });

      const allHoldings = await storage.getTrading212Holdings(platformId, userId);

      const dateMap = new Map<string, { date: string; instruments: Record<string, { value: number; ppl: number }> }>();
      for (const h of allHoldings) {
        const dateStr = new Date(h.date).toISOString().split("T")[0];
        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, { date: dateStr, instruments: {} });
        }
        const entry = dateMap.get(dateStr)!;
        entry.instruments[h.ticker] = {
          value: parseFloat(h.value || "0"),
          ppl: parseFloat(h.ppl || "0"),
        };
      }

      const chartData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      res.json({ chartData });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch holdings chart data" });
    }
  });

  app.get('/api/dashboard-filters', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const filters = await storage.getDashboardFilters(userId);
      res.json(filters);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/dashboard-filters', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const { name, excludedPlatformIds } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: "name is required" });
      }
      if (!Array.isArray(excludedPlatformIds) || !excludedPlatformIds.every((id: any) => typeof id === 'number' && Number.isInteger(id))) {
        return res.status(400).json({ message: "excludedPlatformIds must be an array of integers" });
      }
      const filter = await storage.createDashboardFilter({ userId, name: name.trim(), excludedPlatformIds });
      res.json(filter);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete('/api/dashboard-filters/:id', requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req)!;
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid filter id" });
      }
      await storage.deleteDashboardFilter(id, userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });


  await seedDatabase();
  // removed importInvestmentData() call to prevent duplicates on restart

  return httpServer;
}

// Seed function
export async function seedDatabase() {
  // Empty seed to avoid default platforms
}
