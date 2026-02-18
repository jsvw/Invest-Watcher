import puppeteer from "puppeteer-core";
import { getChromiumPath } from "./chromium";

export interface SynVestScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const LOGIN_URL = "https://mijn.synvest.nl/login";

export async function scrapeSynVest(email: string, password: string): Promise<SynVestScrapedData> {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: getChromiumPath(),
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    console.log("[SynVest Scraper] Navigating to login page...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30000 });

    console.log("[SynVest Scraper] Filling login form...");
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
    await page.type('input[name="email"], input[type="email"]', email);
    await page.type('input[name="password"], input[type="password"]', password);

    console.log("[SynVest Scraper] Submitting login...");
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 })
    ]);

    console.log("[SynVest Scraper] Extracting balance...");
    // SynVest specific balance extraction logic
    // We'll use a generic approach first to find currency symbols and amounts
    const totalBalance = await page.evaluate(() => {
      const extractNumber = (text: string | null) => {
        if (!text) return null;
        const cleaned = text.replace(/[^0-9.,\-]/g, "").replace(",", ".");
        const match = cleaned.match(/-?\d+\.?\d*/);
        return match ? parseFloat(match[0]) : null;
      };

      // Common SynVest dashboard selectors
      const balanceSelectors = [
        '.dashboard-value', 
        '.total-value', 
        '[class*="balance"]',
        'h2', 'h1'
      ];

      for (const selector of balanceSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of Array.from(elements)) {
          const text = el.textContent || "";
          if (text.includes("€") || text.toLowerCase().includes("totaal")) {
            const val = extractNumber(text);
            if (val && val > 0) return val;
          }
        }
      }
      return 0;
    });

    console.log(`[SynVest Scraper] Scraping complete. Total balance: €${totalBalance}`);

    return {
      totalBalance,
      scrapedAt: new Date(),
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
