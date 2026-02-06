import puppeteer from "puppeteer-core";

export interface GoldRepublicScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const LOGIN_URL = "https://www.goldrepublic.com/nl-nl/inloggen";

export async function scrapeGoldRepublic(username: string, password: string): Promise<GoldRepublicScrapedData> {
  if (!username || !password) {
    throw new Error("Missing username or password. Please re-save your GoldRepublic credentials with all three fields (username, email, password).");
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
          if (t.includes('accept') || t.includes('allow') || t.includes('agree') || t === 'ok') {
            btns[i].click();
            break;
          }
        }
      })()`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (cookieErr) {
      console.log("[GoldRepublic Scraper] Cookie banner handling skipped:", cookieErr);
    }

    console.log("[GoldRepublic Scraper] Waiting for login form...");
    await page.waitForSelector('input[name="username"], input[type="text"], input[id*="user"]', { timeout: 15000 });

    const usernameInput = await page.$('input[name="username"]')
      || await page.$('input[id*="username"]')
      || await page.$('input[type="text"]');
    const passwordInput = await page.$('input[name="password"]')
      || await page.$('input[type="password"]');

    if (!usernameInput || !passwordInput) {
      const availableInputs = await page.evaluate(`(function() {
        return Array.from(document.querySelectorAll('input')).map(function(i) {
          return { name: i.name, type: i.type, id: i.id, placeholder: i.placeholder };
        });
      })()`);
      throw new Error(`Could not find login fields. Available inputs: ${JSON.stringify(availableInputs)}`);
    }

    console.log("[GoldRepublic Scraper] Filling login form...");
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.type(username, { delay: 50 });
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    console.log("[GoldRepublic Scraper] Submitting login...");
    const submitClicked = await page.evaluate(`(function() {
      var buttons = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button'));
      for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
        var v = buttons[i].value ? buttons[i].value.trim().toLowerCase() : "";
        if (t === 'log in' || t === 'login' || t === 'sign in' || v === 'log in' || v === 'login') {
          buttons[i].click();
          return true;
        }
      }
      var submitBtns = document.querySelectorAll('button[type="submit"], input[type="submit"]');
      if (submitBtns.length > 0) {
        submitBtns[submitBtns.length - 1].click();
        return true;
      }
      return false;
    })()`);

    if (!submitClicked) {
      await page.keyboard.press("Enter");
    }

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    console.log(`[GoldRepublic Scraper] Current URL after login: ${currentUrl}`);

    if (currentUrl.includes("login")) {
      const errorText = await page.evaluate(`(function() {
        var errorEl = document.querySelector('.error, .alert, [class*="error"], [class*="alert"], [class*="Error"]');
        return errorEl ? errorEl.textContent.trim() : null;
      })()`);
      throw new Error(`Login failed${errorText ? `: ${errorText}` : ". Check your username and password."}`);
    }

    console.log("[GoldRepublic Scraper] Extracting portfolio value...");
    await new Promise(resolve => setTimeout(resolve, 3000));

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
        debugText: document.body.innerText.substring(0, 3000),
      };

      var table = document.querySelector('.condensed-table.portfolio-table') || document.querySelector('.portfolio-table');
      if (table) {
        var cells = table.querySelectorAll('td, th');
        for (var i = 0; i < cells.length; i++) {
          var text = cells[i].textContent ? cells[i].textContent.trim() : "";
          if (text.match(/€\\s*[\\d.,]+/)) {
            var num = extractEuroNumber(text.replace(/€\\s*/, ""));
            if (num !== null && num > result.totalBalance) {
              result.totalBalance = num;
            }
          }
        }
        if (result.totalBalance > 0) return result;

        var tableText = table.textContent || "";
        var euroMatch = tableText.match(/€\\s*([\\d.,]+)/);
        if (euroMatch) {
          var num = extractEuroNumber(euroMatch[1]);
          if (num !== null && num > 0) {
            result.totalBalance = num;
            return result;
          }
        }
      }

      var allText = document.body.innerText;
      var euroMatches = [];
      var re = /€\\s*([\\d.,]+)/g;
      var m;
      while ((m = re.exec(allText)) !== null) {
        var val = extractEuroNumber(m[1]);
        if (val !== null && val > 0) {
          euroMatches.push(val);
        }
      }
      if (euroMatches.length > 0) {
        euroMatches.sort(function(a, b) { return b - a; });
        result.totalBalance = euroMatches[0];
      }

      return result;
    })()`) as { totalBalance: number; debugText: string };

    console.log(`[GoldRepublic Scraper] Extracted total balance: ${portfolioData.totalBalance}`);
    console.log(`[GoldRepublic Scraper] Page text preview: ${portfolioData.debugText.substring(0, 500)}`);

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
