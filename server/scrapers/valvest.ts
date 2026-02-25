import puppeteer from "puppeteer-core";
import { getChromiumPath } from "./chromium";

export interface ValvestScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}
const BASE_URL = "https://www.landed.eu";
const PORTFOLIO_URL = "https://www.landed.eu/account/portfolio";

export async function scrapeValvest(email: string, password: string): Promise<ValvestScrapedData> {
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

    console.log("[Valvest Scraper] Navigating to landed.eu...");
    await page.goto(BASE_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("[Valvest Scraper] Dismissing cookie consent if present...");
    try {
      await page.evaluate(`(function() {
        var btns = Array.from(document.querySelectorAll('button, a, [class*="cookie"], [class*="consent"]'));
        for (var i = 0; i < btns.length; i++) {
          var t = btns[i].textContent ? btns[i].textContent.toLowerCase().trim() : "";
          if (t.includes('accept') || t.includes('allow all') || t.includes('agree') || t.includes('toestaan') || t.includes('accepteren') || t.includes('akkoord') || t === 'ok') {
            btns[i].click();
            break;
          }
        }
      })()`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (cookieErr) {
      console.log("[Valvest Scraper] Cookie banner handling skipped");
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

    console.log("[Valvest Scraper] Looking for login button...");
    const loginClicked = await page.evaluate(`(function() {
      var links = Array.from(document.querySelectorAll('a, button'));
      for (var i = 0; i < links.length; i++) {
        var t = links[i].textContent ? links[i].textContent.trim().toLowerCase() : "";
        var href = links[i].getAttribute('href') || "";
        if (t === 'login' || t === 'log in' || t === 'sign in' || t === 'inloggen' ||
            href.includes('/login') || href.includes('/sign-in') || href.includes('/account')) {
          links[i].click();
          return true;
        }
      }
      return false;
    })()`);

    if (!loginClicked) {
      console.log("[Valvest Scraper] No login button found, navigating directly to login page...");
      await page.goto(BASE_URL + "/login", { waitUntil: "networkidle2", timeout: 30000 });
    } else {
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    }
    await new Promise(resolve => setTimeout(resolve, 3000));

    const loginUrl = page.url();
    console.log(`[Valvest Scraper] Login page URL: ${loginUrl}`);

    console.log("[Valvest Scraper] Waiting for email input (#auth-email)...");
    await page.waitForSelector('#auth-email', { timeout: 15000 });

    const emailInput = await page.$('#auth-email');
    if (!emailInput) {
      const availableInputs = await page.evaluate(`(function() {
        return Array.from(document.querySelectorAll('input')).map(function(i) {
          return { name: i.name, type: i.type, id: i.id, placeholder: i.placeholder };
        });
      })()`);
      throw new Error(`Could not find email input (#auth-email). Available inputs: ${JSON.stringify(availableInputs)}`);
    }

    console.log("[Valvest Scraper] Entering email...");
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 50 });

    console.log("[Valvest Scraper] Clicking Continue button...");
    const continueClicked = await page.evaluate(`(function() {
      var buttons = Array.from(document.querySelectorAll('button'));
      for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
        if (t === 'continue' || t === 'verder' || t === 'volgende' || t === 'next') {
          buttons[i].click();
          return true;
        }
      }
      var submitBtns = document.querySelectorAll('button[type="submit"]');
      if (submitBtns.length > 0) {
        submitBtns[0].click();
        return true;
      }
      return false;
    })()`);

    if (!continueClicked) {
      await page.keyboard.press("Enter");
    }

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("[Valvest Scraper] Waiting for password input (#login-password)...");
    await page.waitForSelector('#login-password', { timeout: 15000 });

    const pwInput = await page.$('#login-password');
    if (!pwInput) {
      const currentInputs = await page.evaluate(`(function() {
        return Array.from(document.querySelectorAll('input')).map(function(i) {
          return { name: i.name, type: i.type, id: i.id, placeholder: i.placeholder };
        });
      })()`);
      throw new Error(`Could not find password field (#login-password). Available inputs: ${JSON.stringify(currentInputs)}`);
    }

    console.log("[Valvest Scraper] Entering password...");
    await pwInput.click({ clickCount: 3 });
    await pwInput.type(password, { delay: 50 });

    console.log("[Valvest Scraper] Submitting login...");
    const loginSubmitted = await page.evaluate(`(function() {
      var buttons = Array.from(document.querySelectorAll('button'));
      for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
        if (t === 'log in' || t === 'login' || t === 'sign in' || t === 'inloggen' || t === 'continue' || t === 'submit') {
          buttons[i].click();
          return true;
        }
      }
      var submitBtns = document.querySelectorAll('button[type="submit"]');
      if (submitBtns.length > 0) {
        submitBtns[0].click();
        return true;
      }
      return false;
    })()`);

    if (!loginSubmitted) {
      await page.keyboard.press("Enter");
    }

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    console.log(`[Valvest Scraper] Current URL after login: ${currentUrl}`);

    if (currentUrl.includes("login") || currentUrl.includes("sign-in")) {
      const errorText = await page.evaluate(`(function() {
        var errorEl = document.querySelector('.error, .alert, [class*="error"], [class*="alert"], [class*="Error"], [class*="danger"]');
        return errorEl ? errorEl.textContent.trim() : null;
      })()`);
      throw new Error(`Login failed${errorText ? `: ${errorText}` : ". Check your email and password."}`);
    }

    if (!currentUrl.includes("/account/portfolio")) {
      console.log("[Valvest Scraper] Navigating to portfolio page...");
      await page.goto(PORTFOLIO_URL, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const portfolioUrl = page.url();
    console.log(`[Valvest Scraper] Portfolio page URL: ${portfolioUrl}`);

    if (portfolioUrl.includes("login") || portfolioUrl.includes("sign-in")) {
      throw new Error("Login session not maintained. Redirected back to login page. Check your credentials.");
    }

    try {
      await page.evaluate(`(function() {
        var btns = Array.from(document.querySelectorAll('button, a, [class*="cookie"], [class*="consent"]'));
        for (var i = 0; i < btns.length; i++) {
          var t = btns[i].textContent ? btns[i].textContent.toLowerCase().trim() : "";
          if (t.includes('accept') || t.includes('allow') || t.includes('agree') || t.includes('toestaan') || t.includes('accepteren') || t === 'ok') {
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

    console.log("[Valvest Scraper] Extracting portfolio value...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    const portfolioData = await page.evaluate(`(function() {
      var result = {
        totalBalance: null,
        debugText: document.body.innerText.substring(0, 5000),
      };

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

      var valuePatterns = [
        /(?:Portfolio|Portefeuille)\\s*(?:value|waarde)[\\s\\S]*?€\\s*([\\d.,]+)/i,
        /(?:Total|Totaal|Totale)\\s*(?:value|waarde|balance|saldo)[\\s\\S]*?€\\s*([\\d.,]+)/i,
        /(?:Current|Huidige|Huidig)\\s*(?:value|waarde|balance|saldo)[\\s\\S]*?€\\s*([\\d.,]+)/i,
        /€\\s*([\\d.,]+)\\s*(?:portfolio|portefeuille)/i,
      ];

      for (var i = 0; i < valuePatterns.length; i++) {
        var match = allText.match(valuePatterns[i]);
        if (match) {
          var num = extractNumber(match[1]);
          if (num !== null && num > 0) {
            result.totalBalance = num;
            break;
          }
        }
      }

      if (!result.totalBalance) {
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
              var allNums = container.querySelectorAll('*');
              for (var j = 0; j < allNums.length; j++) {
                var numText = allNums[j].textContent ? allNums[j].textContent.trim() : "";
                if (numText.match(/€\\s*[\\d.,]+/) || numText.match(/[\\d.,]+\\s*€/)) {
                  var val = extractNumber(numText);
                  if (val !== null && val > 0) return val;
                }
              }
              container = container.parentElement;
            }
          }
          return null;
        };

        var labels = ["portfolio value", "portefeuille waarde", "total value", "totale waarde",
                       "current value", "huidige waarde", "total balance", "totaal saldo",
                       "portfolio", "portefeuille"];
        for (var i = 0; i < labels.length; i++) {
          var val = findValueNearLabel(labels[i]);
          if (val) {
            result.totalBalance = val;
            break;
          }
        }
      }

      if (!result.totalBalance) {
        var euroPattern = /€\\s*([\\d.,]+)/g;
        var candidates = [];
        var m;
        while ((m = euroPattern.exec(allText)) !== null) {
          var n = extractNumber(m[1]);
          if (n !== null && n > 10) {
            candidates.push(n);
          }
        }
        if (candidates.length > 0) {
          candidates.sort(function(a, b) { return b - a; });
          result.totalBalance = candidates[0];
        }
      }

      return result;
    })()`) as { totalBalance: number | null; debugText: string };

    console.log(`[Valvest Scraper] Raw extracted balance: ${portfolioData.totalBalance}`);
    console.log(`[Valvest Scraper] Page text preview: ${portfolioData.debugText.substring(0, 2000)}`);

    const totalBalance = portfolioData.totalBalance || 0;

    if (totalBalance === 0) {
      throw new Error("Could not extract portfolio value from the portfolio page. The page structure may have changed.");
    }

    console.log(`[Valvest Scraper] Scraping complete. Total balance: €${totalBalance}`);

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
