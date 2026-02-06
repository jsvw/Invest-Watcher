import type { Express, Request } from "express";
import type { Server } from "http";
import { storage } from "./storage";
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

// Configure multer for file uploads
const upload = multer({ dest: "/tmp/uploads/" });

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
      
      // Group by month and take the last entry for each month
      const monthlyHistory = new Map<string, { date: string; value: number; invested: number }>();
      rawHistory.forEach(entry => {
        const dateObj = new Date(entry.date);
        const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        // Always keep the latest entry for each month (since dates are sorted)
        monthlyHistory.set(monthKey, entry);
      });
      
      // Convert back to array, sorted by date
      const history = Array.from(monthlyHistory.values()).sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      res.json(history);
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
      const excludePlatforms = req.query.excludePlatforms 
        ? (req.query.excludePlatforms as string).split(',').map(Number).filter(n => !isNaN(n))
        : [];
      
      const userPlatforms = await storage.getPlatforms(userId);
      const userValuations = await storage.getAllValuationsForUser(userId);
      const userInvestments = await storage.getAllInvestmentsForUser(userId);
      const userWithdrawals = await storage.getAllWithdrawalsForUser(userId);
      
      // Filter out excluded platforms
      const filteredPlatforms = userPlatforms.filter((p: any) => !excludePlatforms.includes(p.id));
      const filteredValuations = userValuations.filter((v: any) => !excludePlatforms.includes(v.platformId));
      const filteredInvestments = userInvestments.filter((i: any) => !excludePlatforms.includes(i.platformId));
      const filteredWithdrawals = userWithdrawals.filter((w: any) => !excludePlatforms.includes(w.platformId));
      
      // Calculate per-platform MoM using actual valuation months (not calendar months)
      const platformMom = filteredPlatforms.map((platform: any) => {
        // Get valuations for this platform
        const platformVals = filteredValuations
          .filter((v: any) => v.platformId === platform.id)
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        // Group valuations by month and get latest value for each month
        const monthlyVals = new Map<string, number>();
        platformVals.forEach((v: any) => {
          const d = new Date(v.date);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (!monthlyVals.has(key)) {
            monthlyVals.set(key, Number(v.value));
          }
        });
        
        // Get the two most recent months with valuations
        const sortedMonths = Array.from(monthlyVals.keys()).sort().reverse();
        const latestMonth = sortedMonths[0];
        const previousMonth = sortedMonths[1];
        
        // Only calculate MoM if we have at least 2 months of valuation data
        const hasEnoughData = latestMonth && previousMonth;
        const currentValue = latestMonth ? monthlyVals.get(latestMonth)! : 0;
        const prevValue = previousMonth ? monthlyVals.get(previousMonth)! : 0;
        
        // Calculate net investments during the latest month (investments - withdrawals)
        let netInvestmentsDuringPeriod = 0;
        if (latestMonth) {
          const [year, month] = latestMonth.split('-').map(Number);
          const monthStart = new Date(year, month - 1, 1);
          const monthEnd = new Date(year, month, 0, 23, 59, 59);
          
          const investmentsDuringMonth = filteredInvestments
            .filter((i: any) => i.platformId === platform.id)
            .filter((i: any) => {
              const d = new Date(i.date);
              return d >= monthStart && d <= monthEnd;
            })
            .reduce((sum: number, i: any) => sum + Number(i.amount), 0);
          
          const withdrawalsDuringMonth = filteredWithdrawals
            .filter((w: any) => w.platformId === platform.id)
            .filter((w: any) => {
              const d = new Date(w.date);
              return d >= monthStart && d <= monthEnd;
            })
            .reduce((sum: number, w: any) => sum + Number(w.amount), 0);
          
          netInvestmentsDuringPeriod = investmentsDuringMonth - withdrawalsDuringMonth;
        }
        
        // MoM change = value change - net investments (to show actual growth, not deposits)
        const rawChange = currentValue - prevValue;
        const momChange = hasEnoughData ? rawChange - netInvestmentsDuringPeriod : 0;
        const momGrowthPercent = hasEnoughData && prevValue > 0 ? (momChange / prevValue) * 100 : 0;
        
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

      const { scraperType, email, password } = req.body;
      if (!scraperType || !email || !password) {
        return res.status(400).json({ message: "scraperType, email, and password are required" });
      }
      if (typeof email !== "string" || typeof password !== "string" || !email.includes("@")) {
        return res.status(400).json({ message: "Invalid email or password format" });
      }

      const credentials = encrypt(JSON.stringify({ email, password }));

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

      let scraperResult;
      if (config.scraperType === "monefit") {
        const { scrapeMonefit } = await import("./scrapers/monefit");
        scraperResult = await scrapeMonefit(creds.email, creds.password);
      } else {
        return res.status(400).json({ message: `Unknown scraper type: ${config.scraperType}` });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const platform = await storage.getPlatform(platformId, userId);
      if (!platform) return res.status(404).json({ message: "Platform not found" });

      if (scraperResult.totalBalance > 0) {
        const existingVals = await storage.getValuations(platformId);
        const todayStr = today.toISOString().split("T")[0];
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
        const scrapedInv = existingInvestments.find(i => 
          i.notes === "Auto-scraped total invested"
        );
        if (scrapedInv) {
          await storage.updateInvestment(scrapedInv.id, { amount: scraperResult.totalInvested.toFixed(2), date: today });
        } else {
          await storage.createInvestment({
            platformId,
            amount: scraperResult.totalInvested.toFixed(2),
            date: today,
            notes: "Auto-scraped total invested",
          });
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
              notes: "Auto-scraped from Monefit",
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

      res.json({
        success: true,
        data: scraperResult,
        message: `Successfully scraped. Total balance: €${scraperResult.totalBalance.toFixed(2)}, Total invested: €${scraperResult.totalInvested.toFixed(2)}`,
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

  await seedDatabase();
  // removed importInvestmentData() call to prevent duplicates on restart

  return httpServer;
}

// Seed function
export async function seedDatabase() {
  // Empty seed to avoid default platforms
}
