import puppeteer from "puppeteer-core";
import { getChromiumPath } from "./chromium";

export interface KonviScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const LOGIN_URL = "https://live.konvi.app/login";
const PORTFOLIO_URL = "https://live.konvi.app/portfolio";

function extractNumber(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[€$£\s]/g, "").trim();
  const commaLast = cleaned.lastIndexOf(",");
  const dotLast = cleaned.lastIndexOf(".");
  let normalized: string;
  if (commaLast > dotLast) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

export async function scrapeKonvi(email: string, password: string): Promise<KonviScrapedData> {
  if (!email || !password) {
    throw new Error("Missing credentials. Please save your Konvi email and password.");
  }
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: getChromiumPath(),
      headless: true,
      protocolTimeout: 180000,
      timeout: 120000,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--mute-audio",
        "--hide-scrollbars",
        "--disable-software-rasterizer",
        "--disable-features=site-per-process",
        "--js-flags=--max-old-space-size=256",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );

    console.log("[Konvi Scraper] Navigating to login page...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    const pageUrl = page.url();
    console.log("[Konvi Scraper] Current URL:", pageUrl);

    const pageText = await page.evaluate(() => document.body?.innerText || "");
    console.log("[Konvi Scraper] Page text preview:", pageText.substring(0, 500));

    const emailInput = await page.$('input[type="email"]') 
      || await page.$('input[name="email"]')
      || await page.$('input[placeholder*="email" i]')
      || await page.$('input[placeholder*="Email" i]');
    
    if (!emailInput) {
      const inputs = await page.$$('input');
      console.log(`[Konvi Scraper] Found ${inputs.length} input fields on page`);
      for (let i = 0; i < inputs.length; i++) {
        const attrs = await page.evaluate(el => ({
          type: el.type,
          name: el.name,
          placeholder: el.placeholder,
          id: el.id,
          className: el.className,
        }), inputs[i]);
        console.log(`[Konvi Scraper] Input ${i}:`, JSON.stringify(attrs));
      }
      throw new Error("Could not find email input field on login page");
    }

    console.log("[Konvi Scraper] Typing email...");
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 50 });

    const passwordInput = await page.$('input[type="password"]')
      || await page.$('input[name="password"]');
    
    if (!passwordInput) {
      throw new Error("Could not find password input field on login page");
    }

    console.log("[Konvi Scraper] Typing password...");
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    await new Promise(r => setTimeout(r, 500));

    const loginButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const loginBtn = buttons.find(b => {
        const text = b.innerText?.toLowerCase() || '';
        return text.includes('log in') || text.includes('login') || text.includes('sign in') || text.includes('signin');
      });
      if (loginBtn) {
        (loginBtn as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (!loginButton) {
      console.log("[Konvi Scraper] No login button found, trying Enter key...");
      await passwordInput.press("Enter");
    }

    console.log("[Konvi Scraper] Waiting for login to complete...");
    await new Promise(r => setTimeout(r, 8000));

    const postLoginUrl = page.url();
    console.log("[Konvi Scraper] Post-login URL:", postLoginUrl);

    if (postLoginUrl.includes("/login")) {
      const errorText = await page.evaluate(() => {
        const els = document.querySelectorAll('[class*="error"], [class*="alert"], [role="alert"]');
        return Array.from(els).map(e => e.textContent?.trim()).filter(Boolean).join('; ');
      });
      throw new Error(`Login failed. Still on login page. ${errorText || 'Check credentials.'}`);
    }

    console.log("[Konvi Scraper] Navigating to portfolio page...");
    await page.goto(PORTFOLIO_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    console.log("[Konvi Scraper] Portfolio URL:", page.url());

    const portfolioText = await page.evaluate(() => document.body?.innerText || "");
    console.log("[Konvi Scraper] Portfolio page text:", portfolioText.substring(0, 1000));

    const totalBalance = await page.evaluate(() => {
      const bodyText = document.body?.innerText || "";

      const extractNum = (text: string): number | null => {
        const cleaned = text.replace(/[€$£\s]/g, "").trim();
        const commaLast = cleaned.lastIndexOf(",");
        const dotLast = cleaned.lastIndexOf(".");
        let normalized: string;
        if (commaLast > dotLast) {
          normalized = cleaned.replace(/\./g, "").replace(",", ".");
        } else {
          normalized = cleaned.replace(/,/g, "");
        }
        const num = parseFloat(normalized);
        return isNaN(num) ? null : num;
      };

      const patterns = [
        /(?:portfolio\s*value|current\s*value|total\s*value|total\s*balance)[:\s]*([€$£]?\s*[\d.,]+)/i,
        /([€$£]\s*[\d.,]+(?:\.\d{2})?)/,
      ];

      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match) {
          const val = extractNum(match[1] || match[0]);
          if (val !== null && val > 0) return val;
        }
      }

      const allNums: { value: number; element: string }[] = [];
      const elements = document.querySelectorAll('h1, h2, h3, h4, [class*="value"], [class*="balance"], [class*="total"], [class*="amount"], [class*="price"], span, p, div');
      elements.forEach(el => {
        const text = (el as HTMLElement).innerText?.trim();
        if (text && /[€$£]?\s*[\d.,]+/.test(text)) {
          const val = extractNum(text);
          if (val !== null && val > 100 && val < 1000000) {
            allNums.push({ value: val, element: `${el.tagName}.${el.className}` });
          }
        }
      });

      if (allNums.length > 0) {
        console.log("Konvi candidates:", JSON.stringify(allNums.slice(0, 10)));
      }

      return null;
    });

    if (totalBalance === null || totalBalance <= 0) {
      throw new Error("Could not extract portfolio value from Konvi. The page structure may have changed.");
    }

    console.log(`[Konvi Scraper] Portfolio value: €${totalBalance.toFixed(2)}`);

    return {
      totalBalance,
      scrapedAt: new Date(),
    };
  } catch (error: any) {
    console.error("[Konvi Scraper] Error:", error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
