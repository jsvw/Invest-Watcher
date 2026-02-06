import puppeteer from "puppeteer-core";
import { getChromiumPath } from "./chromium";

export interface RoboCashScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}
const LOGIN_URL = "https://robo.cash/login";
const SUMMARY_URL = "https://robo.cash/cabinet/summary";

export async function scrapeRoboCash(email: string, password: string): Promise<RoboCashScrapedData> {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: getChromiumPath(),
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

    console.log("[RoboCash Scraper] Navigating to login page...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("[RoboCash Scraper] Dismissing cookie consent if present...");
    try {
      await page.evaluate(`(function() {
        var btns = Array.from(document.querySelectorAll('button, a'));
        for (var i = 0; i < btns.length; i++) {
          var t = btns[i].textContent ? btns[i].textContent.toLowerCase().trim() : "";
          if (t.includes('accept') || t.includes('allow all') || t.includes('agree') || t.includes('ok')) {
            btns[i].click();
            break;
          }
        }
      })()`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (cookieErr) {
      console.log("[RoboCash Scraper] Cookie banner handling skipped");
    }

    console.log("[RoboCash Scraper] Waiting for login form...");
    await page.waitForSelector('input[type="email"], input[name="email"], input[name="login"]', { timeout: 15000 }).catch(() => {});

    const availableInputs = await page.evaluate(`(function() {
      return Array.from(document.querySelectorAll('input')).map(function(i) {
        return { name: i.name, type: i.type, id: i.id, placeholder: i.placeholder };
      });
    })()`) as Array<{ name: string; type: string; id: string; placeholder: string }>;
    console.log("[RoboCash Scraper] Available inputs:", JSON.stringify(availableInputs));

    console.log("[RoboCash Scraper] Filling login form...");
    const emailSelector = 'input[type="email"], input[name="email"], input[name="login"], input[name="username"]';
    const passwordSelector = 'input[type="password"], input[name="password"]';

    const emailInput = await page.$(emailSelector);
    const passwordInput = await page.$(passwordSelector);

    if (!emailInput || !passwordInput) {
      throw new Error(`Could not find login fields. Available inputs: ${JSON.stringify(availableInputs)}`);
    }

    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 50 });
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    console.log("[RoboCash Scraper] Submitting login...");
    const submitted = await page.evaluate(`(function() {
      var buttons = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button'));
      for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
        var val = buttons[i].value ? buttons[i].value.toLowerCase() : "";
        if (t === 'log in' || t === 'login' || t === 'sign in' || val === 'log in' || val === 'login') {
          buttons[i].click();
          return true;
        }
      }
      var submitBtns = document.querySelectorAll('button[type="submit"], input[type="submit"]');
      if (submitBtns.length > 0) {
        submitBtns[0].click();
        return true;
      }
      return false;
    })()`);

    if (!submitted) {
      await page.keyboard.press("Enter");
    }

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    console.log(`[RoboCash Scraper] Current URL after login: ${currentUrl}`);

    if (currentUrl.includes("login")) {
      const errorText = await page.evaluate(`(function() {
        var errorEl = document.querySelector('.error, .alert-danger, .alert, [class*="error"], [class*="alert"]');
        return errorEl ? errorEl.textContent.trim() : null;
      })()`);
      throw new Error(`Login failed${errorText ? `: ${errorText}` : ". Check your credentials."}`);
    }

    if (!currentUrl.includes("summary")) {
      console.log("[RoboCash Scraper] Navigating to summary page...");
      await page.goto(SUMMARY_URL, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log("[RoboCash Scraper] Extracting total funds from summary page...");
    await page.waitForSelector('.value_roundings', { timeout: 15000 }).catch(() => {
      console.log("[RoboCash Scraper] .value_roundings not found, will try fallbacks");
    });

    const totalBalance = await page.evaluate(`(function() {
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

      var findValueNearLabel = function(labelText) {
        var allElements = document.querySelectorAll('*');
        for (var i = 0; i < allElements.length; i++) {
          var el = allElements[i];
          if (el.children.length > 0) continue;
          var txt = el.textContent ? el.textContent.trim().toLowerCase() : "";
          if (txt.indexOf(labelText.toLowerCase()) === -1) continue;
          if (txt.length > labelText.length * 3) continue;

          var container = el.parentElement;
          for (var lvl = 0; lvl < 5 && container; lvl++) {
            var vals = container.querySelectorAll('.value_roundings');
            if (vals.length > 0) {
              var num = extractNumber(vals[0].textContent);
              if (num !== null && num > 0) return num;
            }
            container = container.parentElement;
          }

          var sibling = el.nextElementSibling;
          for (var s = 0; s < 5 && sibling; s++) {
            var sVals = sibling.querySelectorAll('.value_roundings');
            if (sVals.length > 0) {
              var sNum = extractNumber(sVals[0].textContent);
              if (sNum !== null && sNum > 0) return sNum;
            }
            if (sibling.classList.contains('value_roundings')) {
              var directNum = extractNumber(sibling.textContent);
              if (directNum !== null && directNum > 0) return directNum;
            }
            sibling = sibling.nextElementSibling;
          }
        }
        return null;
      };

      var total = findValueNearLabel("Total funds");
      if (!total) total = findValueNearLabel("Total balance");
      if (!total) total = findValueNearLabel("Portfolio value");

      if (!total) {
        var valueElements = document.querySelectorAll('.value_roundings');
        var candidates = [];
        for (var i = 0; i < valueElements.length; i++) {
          var num = extractNumber(valueElements[i].textContent);
          if (num !== null && num > 100) {
            candidates.push(num);
          }
        }
        if (candidates.length > 0) {
          candidates.sort(function(a, b) { return b - a; });
          total = candidates[0];
        }
      }

      console.log("[RoboCash Scraper] Extracted total: " + total);
      return total || 0;
    })()`) as number;

    console.log(`[RoboCash Scraper] Scraping complete. Total balance: €${totalBalance}`);

    return {
      totalBalance,
      scrapedAt: new Date(),
    };

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
