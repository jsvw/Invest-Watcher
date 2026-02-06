import puppeteer from "puppeteer-core";

export interface MonefitScrapedData {
  mainBalance: number;
  vaults: Array<{
    name: string;
    currentValue: number;
    investedAmount?: number;
    annualYield?: number;
    maturityDate?: string;
  }>;
  totalBalance: number;
  scrapedAt: Date;
}

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const LOGIN_URL = "https://smartsaver.monefit.com/en/login";
const DASHBOARD_URL = "https://smartsaver.monefit.com/en/overview";

export async function scrapeMonefit(email: string, password: string): Promise<MonefitScrapedData> {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );

    console.log("[Monefit Scraper] Navigating to login page...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30000 });

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("[Monefit Scraper] Dismissing cookie consent banner...");
    try {
      const allowAllBtn = await page.$('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
      if (allowAllBtn) {
        await allowAllBtn.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        const allowSelectionBtn = await page.$('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection');
        if (allowSelectionBtn) {
          await allowSelectionBtn.click();
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const allowBtn = btns.find(b =>
              b.textContent?.toLowerCase().includes('allow all') ||
              b.textContent?.toLowerCase().includes('accept all') ||
              b.textContent?.toLowerCase().includes('allow selection')
            );
            if (allowBtn) (allowBtn as HTMLElement).click();
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (cookieErr) {
      console.log("[Monefit Scraper] Cookie banner handling skipped:", cookieErr);
    }

    console.log("[Monefit Scraper] Waiting for login form...");
    await page.waitForSelector('input[name="identificator"], input[aria-label="email"]', { timeout: 15000 });

    console.log("[Monefit Scraper] Filling login form...");
    const emailInput = await page.$('input[name="identificator"]') || await page.$('input[aria-label="email"]');
    const passwordInput = await page.$('input[name="password"]') || await page.$('input[type="password"]');

    if (!emailInput || !passwordInput) {
      const availableInputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(i => ({
          name: i.name, type: i.type, ariaLabel: i.getAttribute('aria-label')
        }));
      });
      throw new Error(`Could not find login fields. Available inputs: ${JSON.stringify(availableInputs)}`);
    }

    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 50 });
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    console.log("[Monefit Scraper] Submitting login...");
    const submitButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button[type="submit"]'));
      const loginBtn = buttons.find(b => b.textContent?.trim().toLowerCase() === 'log in');
      if (loginBtn) {
        (loginBtn as HTMLElement).click();
        return true;
      }
      if (buttons.length > 0) {
        const lastSubmit = buttons[buttons.length - 1];
        (lastSubmit as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (!submitButton) {
      await page.keyboard.press("Enter");
    }

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    console.log(`[Monefit Scraper] Current URL after login: ${currentUrl}`);

    if (currentUrl.includes("login")) {
      const errorText = await page.evaluate(() => {
        const errorEl = document.querySelector('.error, .alert, [class*="error"], [class*="alert"]');
        return errorEl ? errorEl.textContent?.trim() : null;
      });
      throw new Error(`Login failed${errorText ? `: ${errorText}` : ". Check your credentials."}`);
    }

    if (!currentUrl.includes("overview")) {
      console.log("[Monefit Scraper] Navigating to overview...");
      await page.goto(DASHBOARD_URL, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log("[Monefit Scraper] Extracting balance data...");
    const pageContent = await page.content();

    const data = await page.evaluate(() => {
      const extractNumber = (text: string | null | undefined): number | null => {
        if (!text) return null;
        const cleaned = text.replace(/[^0-9.,\-]/g, "").replace(/,/g, ".");
        const match = cleaned.match(/-?\d+\.?\d*/);
        return match ? parseFloat(match[0]) : null;
      };

      const allText = document.body.innerText;
      const result = {
        mainBalance: 0,
        totalBalance: 0,
        vaultTexts: [] as string[],
        debugText: allText.substring(0, 2000),
      };

      const balanceElements = Array.from(document.querySelectorAll('h1, h2, h3, [class*="balance"], [class*="total"], [class*="amount"], [data-testid*="balance"]'));
      for (const el of balanceElements) {
        const text = el.textContent?.trim() || "";
        if (text.includes("€") || text.match(/\d+[.,]\d{2}/)) {
          const num = extractNumber(text);
          if (num !== null && num > 0) {
            if (num > result.totalBalance) {
              result.totalBalance = num;
            }
          }
        }
      }

      const allElements = Array.from(document.querySelectorAll("*"));
      for (const el of allElements) {
        const text = (el as HTMLElement).innerText?.trim() || "";
        if (text.toLowerCase().includes("vault") || text.toLowerCase().includes("smart saver")) {
          result.vaultTexts.push(text.substring(0, 500));
        }
      }

      return result;
    });

    console.log(`[Monefit Scraper] Raw extracted data - total: ${data.totalBalance}`);
    console.log(`[Monefit Scraper] Debug text: ${data.debugText.substring(0, 500)}`);

    const moneyPattern = /€\s*([\d.,]+)/g;
    const matches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = moneyPattern.exec(pageContent)) !== null) {
      matches.push(m);
    }
    const amounts = matches
      .map(m => parseFloat(m[1].replace(/,/g, ".")))
      .filter(n => !isNaN(n) && n > 0)
      .sort((a, b) => b - a);

    console.log(`[Monefit Scraper] Found amounts in page: ${JSON.stringify(amounts.slice(0, 10))}`);

    const totalBalance = data.totalBalance > 0 ? data.totalBalance : (amounts.length > 0 ? amounts[0] : 0);

    let vaults: MonefitScrapedData["vaults"] = [];
    try {
      const vaultUrl = "https://smartsaver.monefit.com/en/overview";
      if (!page.url().includes("overview")) {
        await page.goto(vaultUrl, { waitUntil: "networkidle2", timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      const vaultData = await page.evaluate(() => {
        const vaults: Array<{ name: string; value: number; yield?: number; maturity?: string }> = [];

        const extractNum = (text: string | null | undefined): number | null => {
          if (!text) return null;
          const cleaned = text.replace(/[^0-9.,\-]/g, "").replace(/,/g, ".");
          const match = cleaned.match(/-?\d+\.?\d*/);
          return match ? parseFloat(match[0]) : null;
        };

        const vaultElements = Array.from(document.querySelectorAll('[class*="vault"], [class*="Vault"], [data-testid*="vault"]'));
        for (const el of vaultElements) {
          const name = el.querySelector('h3, h4, [class*="title"], [class*="name"]')?.textContent?.trim();
          const valueText = el.querySelector('[class*="value"], [class*="amount"], [class*="balance"]')?.textContent?.trim();
          const value = extractNum(valueText);

          if (name && value !== null && value > 0) {
            const yieldText = el.textContent?.match(/(\d+\.?\d*)\s*%/);
            const maturityText = el.textContent?.match(/(\d{1,2}[./]\d{1,2}[./]\d{2,4})/);

            vaults.push({
              name,
              value,
              yield: yieldText ? parseFloat(yieldText[1]) : undefined,
              maturity: maturityText ? maturityText[1] : undefined,
            });
          }
        }

        return vaults;
      });

      vaults = vaultData.map(v => ({
        name: v.name,
        currentValue: v.value,
        annualYield: v.yield,
        maturityDate: v.maturity,
      }));
    } catch (vaultErr) {
      console.log(`[Monefit Scraper] Could not extract vault details: ${vaultErr}`);
    }

    const mainBalance = vaults.length > 0
      ? totalBalance - vaults.reduce((sum, v) => sum + v.currentValue, 0)
      : totalBalance;

    const result: MonefitScrapedData = {
      mainBalance: Math.max(0, mainBalance),
      vaults,
      totalBalance,
      scrapedAt: new Date(),
    };

    console.log(`[Monefit Scraper] Scraping complete. Total balance: €${totalBalance}, Vaults: ${vaults.length}`);
    return result;

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
