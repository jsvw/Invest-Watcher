import puppeteer from "puppeteer-core";

export interface GoldRepublicScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const LOGIN_URL = "https://www.goldrepublic.com/nl-nl/inloggen";
const PERFORMANCE_URL = "https://www.goldrepublic.com/nl-nl/performance";

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
            break;
          }
        }
      })()`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log("[GoldRepublic Scraper] Cookie banner handled");
    } catch (cookieErr) {
      console.log("[GoldRepublic Scraper] Cookie banner handling skipped");
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

    const usernameInput = await page.$('input[name="LoginForm[username]"]')
      || await page.$('input#LoginForm_username')
      || await page.$('input[name="username"]')
      || await page.$('input[type="text"]');
    const emailInput = await page.$('input[name="LoginForm[email]"]')
      || await page.$('input#LoginForm_email')
      || await page.$('input[name="email"]')
      || await page.$('input[type="email"]');
    const passwordInput = await page.$('input[name="LoginForm[password]"]')
      || await page.$('input#LoginForm_password')
      || await page.$('input[name="password"]')
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

    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(email, { delay: 50 });
    }

    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    console.log("[GoldRepublic Scraper] Submitting login...");
    const submitClicked = await page.evaluate(`(function() {
      var submitBtns = document.querySelectorAll('button[type="submit"], input[type="submit"]');
      if (submitBtns.length > 0) {
        submitBtns[0].click();
        return true;
      }
      return false;
    })()`);

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

    console.log("[GoldRepublic Scraper] Navigating to performance page...");
    await page.goto(PERFORMANCE_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const perfUrl = page.url();
    console.log(`[GoldRepublic Scraper] Performance page URL: ${perfUrl}`);

    if (perfUrl.includes("inloggen") || perfUrl.includes("login")) {
      throw new Error("Login session not maintained. Redirected back to login page. Check your credentials.");
    }

    try {
      await page.evaluate(`(function() {
        var btns = Array.from(document.querySelectorAll('button, a, [class*="cookie"], [class*="consent"]'));
        for (var i = 0; i < btns.length; i++) {
          var t = btns[i].textContent ? btns[i].textContent.toLowerCase().trim() : "";
          if (t.includes('toestaan') || t.includes('accepteren') || t.includes('akkoord') || t.includes('accept') || t.includes('allow') || t === 'ok') {
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

    console.log("[GoldRepublic Scraper] Extracting portfolio value from performance page...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    const extractEuroNumber = (text: string): number | null => {
      if (!text) return null;
      const cleaned = text.replace(/[^0-9.,\-]/g, "");
      const normalized = cleaned.replace(/\./g, "").replace(",", ".");
      const match = normalized.match(/-?\d+\.?\d*/);
      return match ? parseFloat(match[0]) : null;
    };

    const portfolioData = await page.evaluate(`(function() {
      var result = {
        portfolioValue: null,
        debugText: document.body.innerText.substring(0, 5000),
      };

      var allText = document.body.innerText;

      var patterns = [
        /Huidige\\s+portefeuillewaarde[\\s\\S]*?€\\s*([\\d.,]+)/i,
        /Current\\s+portfolio\\s+value[\\s\\S]*?€\\s*([\\d.,]+)/i,
        /portefeuillewaarde[\\s\\S]*?€\\s*([\\d.,]+)/i,
      ];

      for (var i = 0; i < patterns.length; i++) {
        var match = allText.match(patterns[i]);
        if (match) {
          result.portfolioValue = match[1];
          break;
        }
      }

      return result;
    })()`) as { portfolioValue: string | null; debugText: string };

    console.log(`[GoldRepublic Scraper] Raw portfolio value text: ${portfolioData.portfolioValue}`);
    console.log(`[GoldRepublic Scraper] Page text preview: ${portfolioData.debugText.substring(0, 2000)}`);

    let totalBalance = 0;
    if (portfolioData.portfolioValue) {
      const parsed = extractEuroNumber(portfolioData.portfolioValue);
      if (parsed !== null && parsed > 0) {
        totalBalance = parsed;
      }
    }

    if (totalBalance === 0) {
      throw new Error("Could not extract portfolio value from performance page. Page content may have changed.");
    }

    console.log(`[GoldRepublic Scraper] Final portfolio value: €${totalBalance}`);

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
