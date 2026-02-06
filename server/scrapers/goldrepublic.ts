import puppeteer from "puppeteer-core";

export interface GoldRepublicScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const LOGIN_URL = "https://www.goldrepublic.com/nl-nl/inloggen";
const ACCOUNT_URL = "https://www.goldrepublic.com/nl-nl/account";

export async function scrapeGoldRepublic(username: string, email: string, password: string): Promise<GoldRepublicScrapedData> {
  if (!username || !email || !password) {
    throw new Error("Missing credentials. Please re-save your GoldRepublic credentials with all three fields (username, email, password).");
  }
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

    console.log("[GoldRepublic Scraper] Navigating to login page...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      await page.evaluate(`(function() {
        var btns = Array.from(document.querySelectorAll('button, a, [class*="cookie"], [class*="consent"]'));
        for (var i = 0; i < btns.length; i++) {
          var t = btns[i].textContent ? btns[i].textContent.toLowerCase().trim() : "";
          if (t.includes('accept') || t.includes('allow') || t.includes('agree') || t.includes('toestaan') || t.includes('accepteren') || t.includes('akkoord') || t === 'ok') {
            btns[i].click();
            console.log('Cookie button clicked: ' + t);
            break;
          }
        }
      })()`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log("[GoldRepublic Scraper] Cookie banner handled");
    } catch (cookieErr) {
      console.log("[GoldRepublic Scraper] Cookie banner handling skipped:", cookieErr);
    }

    try {
      await page.evaluate(`(function() {
        var overlays = document.querySelectorAll('[class*="cookie"], [class*="consent"], [class*="banner"], [id*="cookie"], [id*="consent"]');
        overlays.forEach(function(el) {
          if (el.offsetHeight > 100 || getComputedStyle(el).position === 'fixed') {
            el.style.display = 'none';
          }
        });
      })()`);
    } catch (e) {}

    console.log("[GoldRepublic Scraper] Waiting for login form...");
    await page.waitForSelector('input', { timeout: 15000 });

    const availableInputs = await page.evaluate(`(function() {
      return Array.from(document.querySelectorAll('input')).map(function(i) {
        return { name: i.name, type: i.type, id: i.id, placeholder: i.placeholder };
      });
    })()`) as Array<{name: string; type: string; id: string; placeholder: string}>;
    console.log(`[GoldRepublic Scraper] Available inputs: ${JSON.stringify(availableInputs)}`);

    const usernameInput = await page.$('input[name="username"]')
      || await page.$('input[id*="username"]')
      || await page.$('input[type="text"]');
    const emailInput = await page.$('input[name="email"]')
      || await page.$('input[type="email"]')
      || await page.$('input[id*="email"]');
    const passwordInput = await page.$('input[name="password"]')
      || await page.$('input[type="password"]');

    if (!usernameInput || !passwordInput) {
      throw new Error(`Could not find login fields. Available inputs: ${JSON.stringify(availableInputs)}`);
    }

    console.log("[GoldRepublic Scraper] Filling login form...");
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.type(username, { delay: 50 });

    if (emailInput) {
      console.log("[GoldRepublic Scraper] Filling email field...");
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(email, { delay: 50 });
    } else {
      console.log("[GoldRepublic Scraper] No separate email field found, skipping...");
    }

    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    console.log("[GoldRepublic Scraper] Submitting login...");
    const submitClicked = await page.evaluate(`(function() {
      var buttons = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button'));
      for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
        var v = buttons[i].value ? buttons[i].value.trim().toLowerCase() : "";
        if (t === 'log in' || t === 'login' || t === 'sign in' || t === 'inloggen' || v === 'log in' || v === 'login' || v === 'inloggen') {
          buttons[i].click();
          return 'clicked: ' + t;
        }
      }
      var submitBtns = document.querySelectorAll('button[type="submit"], input[type="submit"]');
      if (submitBtns.length > 0) {
        submitBtns[submitBtns.length - 1].click();
        return 'clicked submit fallback';
      }
      return false;
    })()`);
    console.log(`[GoldRepublic Scraper] Submit result: ${submitClicked}`);

    if (!submitClicked) {
      await page.keyboard.press("Enter");
    }

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 5000));

    const currentUrl = page.url();
    console.log(`[GoldRepublic Scraper] Current URL after login: ${currentUrl}`);

    if (currentUrl.includes("inloggen") || currentUrl.includes("login")) {
      const errorText = await page.evaluate(`(function() {
        var errorEl = document.querySelector('.error, .alert, [class*="error"], [class*="alert"], [class*="Error"]');
        return errorEl ? errorEl.textContent.trim() : null;
      })()`);
      throw new Error(`Login failed${errorText ? `: ${errorText}` : ". Check your username and password."}`);
    }

    console.log("[GoldRepublic Scraper] Navigating to account dashboard...");
    await page.goto(ACCOUNT_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const accountUrl = page.url();
    console.log(`[GoldRepublic Scraper] Account page URL: ${accountUrl}`);

    if (accountUrl.includes("inloggen") || accountUrl.includes("login")) {
      throw new Error("Login session not maintained. Redirected back to login page. Check your credentials.");
    }

    try {
      await page.evaluate(`(function() {
        var btns = Array.from(document.querySelectorAll('button, a, [class*="cookie"], [class*="consent"]'));
        for (var i = 0; i < btns.length; i++) {
          var t = btns[i].textContent ? btns[i].textContent.toLowerCase().trim() : "";
          if (t.includes('accept') || t.includes('allow') || t.includes('toestaan') || t.includes('accepteren') || t.includes('akkoord') || t === 'ok') {
            btns[i].click();
            break;
          }
        }
        var overlays = document.querySelectorAll('[class*="cookie"], [class*="consent"], [class*="banner"], [id*="cookie"], [id*="consent"]');
        overlays.forEach(function(el) {
          if (el.offsetHeight > 100 || getComputedStyle(el).position === 'fixed') {
            el.style.display = 'none';
          }
        });
      })()`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {}

    console.log("[GoldRepublic Scraper] Extracting portfolio value...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    const portfolioData = await page.evaluate(`(function() {
      var extractEuroNumber = function(text) {
        if (!text) return null;
        var cleaned = text.replace(/[^0-9.,\\-]/g, "");
        cleaned = cleaned.replace(/\\./g, "").replace(",", ".");
        var match = cleaned.match(/-?\\d+\\.?\\d*/);
        return match ? parseFloat(match[0]) : null;
      };

      var result = {
        totalBalance: 0,
        debugText: document.body.innerText.substring(0, 5000),
        allEuroValues: [],
      };

      var allText = document.body.innerText;
      var re = /€\\s*([\\d.,]+)/g;
      var m;
      while ((m = re.exec(allText)) !== null) {
        var val = extractEuroNumber(m[1]);
        if (val !== null && val > 0) {
          result.allEuroValues.push(val);
        }
      }

      var table = document.querySelector('.condensed-table.portfolio-table') || document.querySelector('.portfolio-table');
      if (table) {
        var rows = table.querySelectorAll('tr');
        var lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
        if (lastRow) {
          var lastRowText = lastRow.textContent || "";
          var lastRowMatch = lastRowText.match(/€\\s*([\\d.,]+)/);
          if (lastRowMatch) {
            var totalVal = extractEuroNumber(lastRowMatch[1]);
            if (totalVal !== null && totalVal > 0) {
              result.totalBalance = totalVal;
              return result;
            }
          }
        }

        var cells = table.querySelectorAll('td, th');
        var tableValues = [];
        for (var i = 0; i < cells.length; i++) {
          var text = cells[i].textContent ? cells[i].textContent.trim() : "";
          if (text.match(/€\\s*[\\d.,]+/)) {
            var num = extractEuroNumber(text.replace(/€\\s*/, ""));
            if (num !== null && num > 0) {
              tableValues.push(num);
            }
          }
        }
        if (tableValues.length > 0) {
          result.totalBalance = tableValues[tableValues.length - 1];
          return result;
        }
      }

      if (result.allEuroValues.length > 0) {
        result.allEuroValues.sort(function(a, b) { return b - a; });
        result.totalBalance = result.allEuroValues[0];
      }

      return result;
    })()`) as { totalBalance: number; debugText: string; allEuroValues: number[] };

    console.log(`[GoldRepublic Scraper] Extracted total balance: ${portfolioData.totalBalance}`);
    console.log(`[GoldRepublic Scraper] All euro values found: ${JSON.stringify(portfolioData.allEuroValues)}`);
    console.log(`[GoldRepublic Scraper] Page text preview: ${portfolioData.debugText.substring(0, 2000)}`);

    return {
      totalBalance: portfolioData.totalBalance,
      scrapedAt: new Date(),
    };

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
