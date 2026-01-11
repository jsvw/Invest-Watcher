import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { valuations } from "@shared/schema";
import { api } from "@shared/routes";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";
import OpenAI from "openai";
import { importInvestmentData } from "./seed_data";

// Initialize OpenAI client for insights
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register AI integration routes
  registerChatRoutes(app);
  registerImageRoutes(app);

  // --- Platforms ---
  app.get(api.platforms.list.path, async (_req, res) => {
    const platforms = await storage.getPlatforms();
    res.json(platforms);
  });

  app.post(api.platforms.create.path, async (req, res) => {
    try {
      const input = api.platforms.create.input.parse(req.body);
      const platform = await storage.createPlatform(input);
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

  app.get(api.platforms.get.path, async (req, res) => {
    const platform = await storage.getPlatform(Number(req.params.id));
    if (!platform) {
      return res.status(404).json({ message: 'Platform not found' });
    }
    res.json(platform);
  });

  // --- Investments ---
  app.get(api.investments.list.path, async (req, res) => {
    const investments = await storage.getInvestments(Number(req.params.platformId));
    res.json(investments);
  });

  app.post(api.investments.create.path, async (req, res) => {
    try {
      // Coerce numeric strings to numbers if needed, though schema uses numeric string for pg
      const input = api.investments.create.input.parse(req.body);
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

  app.patch('/api/investments/:id', async (req, res) => {
    try {
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

  // --- Valuations ---
  app.get(api.valuations.list.path, async (req, res) => {
    const valuations = await storage.getValuations(Number(req.params.platformId));
    res.json(valuations);
  });

  app.post(api.valuations.create.path, async (req, res) => {
    try {
      const input = api.valuations.create.input.parse(req.body);
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

  app.patch('/api/valuations/:id', async (req, res) => {
    try {
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

  // --- Insights ---
  app.post(api.insights.generate.path, async (req, res) => {
    try {
      const { prompt } = req.body;
      
      // Fetch all data to provide context to AI
      const platforms = await storage.getPlatforms();
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

  app.get(api.portfolio.history.path, async (req, res) => {
    try {
      const range = req.query.range as string || 'year';
      const platformId = req.query.platformId ? Number(req.query.platformId) : null;
      
      const allInvestments = await storage.getAllInvestments();
      const allValuations = await db.select().from(valuations).orderBy(desc(valuations.date));
      
      const filteredInvestments = platformId 
        ? allInvestments.filter(inv => inv.platformId === platformId)
        : allInvestments;
      
      const filteredValuations = platformId
        ? allValuations.filter(val => val.platformId === platformId)
        : allValuations;
      
      const dates = new Set<string>();
      filteredInvestments.forEach(inv => dates.add(new Date(inv.date).toISOString().split('T')[0]));
      filteredValuations.forEach(val => dates.add(new Date(val.date).toISOString().split('T')[0]));
      
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
        startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59);
        sortedDates = sortedDates.filter(d => {
          const dt = new Date(d);
          return dt >= startDate! && dt <= endDate;
        });
        startDate = null; // Prevent further filtering
      }

      if (startDate) {
        sortedDates = sortedDates.filter(d => new Date(d) >= startDate!);
      }

      const history = sortedDates.map(date => {
        const dateObj = new Date(date);
        
        // Sum investments up to this date
        const invested = filteredInvestments
          .filter(inv => new Date(inv.date) <= dateObj)
          .reduce((sum, inv) => sum + Number(inv.amount), 0);
          
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
      
      res.json(history);
    } catch (error) {
      console.error("Error fetching portfolio history:", error);
      res.status(500).json({ message: "Failed to fetch portfolio history" });
    }
  });

  app.get('/api/portfolio/available-filters', async (req, res) => {
    try {
      const platformId = req.query.platformId ? Number(req.query.platformId) : null;
      const allInvestments = await storage.getAllInvestments();
      const allValuations = await db.select().from(valuations);
      
      const filteredInvestments = platformId 
        ? allInvestments.filter(inv => inv.platformId === platformId)
        : allInvestments;
      
      const filteredValuations = platformId
        ? allValuations.filter(val => val.platformId === platformId)
        : allValuations;

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

  await seedDatabase();
  // removed importInvestmentData() call to prevent duplicates on restart

  return httpServer;
}

// Seed function
export async function seedDatabase() {
  // Empty seed to avoid default platforms
}
