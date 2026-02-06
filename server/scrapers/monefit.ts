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
          await page.evaluate(`(function() {
            var btns = Array.from(document.querySelectorAll('button, a'));
            for (var i = 0; i < btns.length; i++) {
              var t = btns[i].textContent ? btns[i].textContent.toLowerCase() : "";
              if (t.includes('allow all') || t.includes('accept all') || t.includes('allow selection')) {
                btns[i].click();
                break;
              }
            }
          })()`);
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
      const availableInputs = await page.evaluate(`(function() {
        return Array.from(document.querySelectorAll('input')).map(function(i) {
          return { name: i.name, type: i.type, ariaLabel: i.getAttribute('aria-label') };
        });
      })()`);
      throw new Error(`Could not find login fields. Available inputs: ${JSON.stringify(availableInputs)}`);
    }

    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 50 });
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    console.log("[Monefit Scraper] Submitting login...");
    const submitButton = await page.evaluate(`(function() {
      var buttons = Array.from(document.querySelectorAll('button[type="submit"]'));
      for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
        if (t === 'log in') {
          buttons[i].click();
          return true;
        }
      }
      if (buttons.length > 0) {
        buttons[buttons.length - 1].click();
        return true;
      }
      return false;
    })()`);

    if (!submitButton) {
      await page.keyboard.press("Enter");
    }

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    console.log(`[Monefit Scraper] Current URL after login: ${currentUrl}`);

    if (currentUrl.includes("login")) {
      const errorText = await page.evaluate(`(function() {
        var errorEl = document.querySelector('.error, .alert, [class*="error"], [class*="alert"]');
        return errorEl ? errorEl.textContent.trim() : null;
      })()`);
      throw new Error(`Login failed${errorText ? `: ${errorText}` : ". Check your credentials."}`);
    }

    if (!currentUrl.includes("summary")) {
      console.log("[Monefit Scraper] Navigating to summary page...");
      await page.goto("https://smartsaver.monefit.com/en/summary", { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log("[Monefit Scraper] Extracting total balance from summary page...");
    await page.waitForSelector('.summary-content-balance', { timeout: 10000 }).catch(() => {
      console.log("[Monefit Scraper] .summary-content-balance not found, will try fallback");
    });

    const summaryData = await page.evaluate(`(function() {
      var extractNumber = function(text) {
        if (!text) return null;
        var cleaned = text.replace(/[^0-9.,\\-]/g, "");
        if (cleaned.indexOf(",") > -1 && cleaned.indexOf(".") > -1) {
          if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
            cleaned = cleaned.replace(/\\./g, "").replace(",", ".");
          } else {
            cleaned = cleaned.replace(/,/g, "");
          }
        } else if (cleaned.indexOf(",") > -1) {
          var parts = cleaned.split(",");
          if (parts.length === 2 && parts[1].length <= 2) {
            cleaned = cleaned.replace(",", ".");
          } else {
            cleaned = cleaned.replace(/,/g, "");
          }
        }
        var match = cleaned.match(/-?\\d+\\.?\\d*/);
        return match ? parseFloat(match[0]) : null;
      };

      var allText = document.body.innerText;
      var result = {
        totalBalance: 0,
        debugText: allText.substring(0, 2000),
      };

      var balanceEl = document.querySelector('.summary-content-balance');
      if (balanceEl) {
        var num = extractNumber(balanceEl.textContent);
        if (num !== null && num > 0) {
          result.totalBalance = num;
        }
      }

      if (result.totalBalance === 0) {
        var fallbackEls = Array.from(document.querySelectorAll('h1, h2, h3, [class*="balance"], [class*="total"], [class*="amount"]'));
        for (var i = 0; i < fallbackEls.length; i++) {
          var text = fallbackEls[i].textContent ? fallbackEls[i].textContent.trim() : "";
          if (text.match(/\\d+[.,]\\d{2}/)) {
            var n = extractNumber(text);
            if (n !== null && n > result.totalBalance) {
              result.totalBalance = n;
            }
          }
        }
      }

      return result;
    })()`) as { totalBalance: number; debugText: string };

    console.log(`[Monefit Scraper] Extracted total balance: ${summaryData.totalBalance}`);
    console.log(`[Monefit Scraper] Summary page text: ${summaryData.debugText.substring(0, 500)}`);

    let totalBalance = summaryData.totalBalance;

    if (totalBalance === 0) {
      const pageContent = await page.content();
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

      console.log(`[Monefit Scraper] Fallback amounts from HTML: ${JSON.stringify(amounts.slice(0, 10))}`);
      totalBalance = amounts.length > 0 ? amounts[0] : 0;
    }

    let vaults: MonefitScrapedData["vaults"] = [];
    try {
      console.log("[Monefit Scraper] Navigating to overview for vault details...");
      await page.goto(DASHBOARD_URL, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      const vaultData = await page.evaluate(`(function() {
        var vaults = [];

        var extractNum = function(text) {
          if (!text) return null;
          var cleaned = text.replace(/[^0-9.,\\-]/g, "");
          if (cleaned.indexOf(",") > -1 && cleaned.indexOf(".") > -1) {
            if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
              cleaned = cleaned.replace(/\\./g, "").replace(",", ".");
            } else {
              cleaned = cleaned.replace(/,/g, "");
            }
          } else if (cleaned.indexOf(",") > -1) {
            var parts = cleaned.split(",");
            if (parts.length === 2 && parts[1].length <= 2) {
              cleaned = cleaned.replace(",", ".");
            } else {
              cleaned = cleaned.replace(/,/g, "");
            }
          }
          var match = cleaned.match(/-?\\d+\\.?\\d*/);
          return match ? parseFloat(match[0]) : null;
        };

        var vaultElements = Array.from(document.querySelectorAll('[class*="vault"], [class*="Vault"], [data-testid*="vault"]'));
        for (var i = 0; i < vaultElements.length; i++) {
          var el = vaultElements[i];
          var nameEl = el.querySelector('h3, h4, [class*="title"], [class*="name"]');
          var name = nameEl ? nameEl.textContent.trim() : null;
          var valueEl = el.querySelector('[class*="value"], [class*="amount"], [class*="balance"]');
          var valueText = valueEl ? valueEl.textContent.trim() : null;
          var value = extractNum(valueText);

          if (name && value !== null && value > 0) {
            var yieldMatch = el.textContent.match(/(\\d+\\.?\\d*)\\s*%/);
            var maturityMatch = el.textContent.match(/(\\d{1,2}[\\.\/]\\d{1,2}[\\.\/]\\d{2,4})/);

            vaults.push({
              name: name,
              value: value,
              yieldPct: yieldMatch ? parseFloat(yieldMatch[1]) : null,
              maturity: maturityMatch ? maturityMatch[1] : null,
            });
          }
        }

        return vaults;
      })()`) as Array<{ name: string; value: number; yieldPct?: number | null; maturity?: string | null }>;

      vaults = vaultData.map(v => ({
        name: v.name,
        currentValue: v.value,
        annualYield: v.yieldPct ?? undefined,
        maturityDate: v.maturity ?? undefined,
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
