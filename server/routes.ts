import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
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
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_completion_tokens: 1000,
      });

      const insight = response.choices[0]?.message?.content || "Could not generate insights at this time.";
      
      res.json({ insight });
    } catch (error) {
      console.error("Error generating insights:", error);
      res.status(500).json({ message: "Failed to generate insights" });
  await seedDatabase();
  // removed importInvestmentData() call to prevent duplicates on restart

  return httpServer;
}

// Seed function
export async function seedDatabase() {
  // Empty seed to avoid default platforms
}
