import puppeteer from "puppeteer-core";
import { getChromiumPath } from "./chromium";

export interface ValvestScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}
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

    console.log("[Valvest Scraper] Navigating to portfolio page (will redirect to login if needed)...");
    await page.goto(PORTFOLIO_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const initialUrl = page.url();
    console.log(`[Valvest Scraper] Initial URL: ${initialUrl}`);

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

    const hasEmailField = await page.$('#auth-email');
    if (hasEmailField) {
      console.log("[Valvest Scraper] Login form detected, entering email into #auth-email...");
      await hasEmailField.click({ clickCount: 3 });
      await hasEmailField.type(email, { delay: 50 });

      console.log("[Valvest Scraper] Clicking Continue button...");
      const continueClicked = await page.evaluate(`(function() {
        var buttons = Array.from(document.querySelectorAll('button'));
        for (var i = 0; i < buttons.length; i++) {
          var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
          if (t === 'continue' || t === 'verder' || t === 'volgende' || t === 'next') {
            buttons[i].click();
            return t;
          }
        }
        var submitBtns = document.querySelectorAll('button[type="submit"]');
        if (submitBtns.length > 0) {
          submitBtns[0].click();
          return 'submit';
        }
        return false;
      })()`);
      console.log(`[Valvest Scraper] Continue button clicked: ${continueClicked}`);

      if (!continueClicked) {
        await page.keyboard.press("Enter");
      }

      console.log("[Valvest Scraper] Waiting for password input (#login-password) to appear...");
      await page.waitForSelector('#login-password', { visible: true, timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 1000));

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
            return t;
          }
        }
        var submitBtns = document.querySelectorAll('button[type="submit"]');
        if (submitBtns.length > 0) {
          submitBtns[0].click();
          return 'submit';
        }
        return false;
      })()`);
      console.log(`[Valvest Scraper] Login button clicked: ${loginSubmitted}`);

      if (!loginSubmitted) {
        await page.keyboard.press("Enter");
      }

      console.log("[Valvest Scraper] Waiting for login to complete...");
      await new Promise(resolve => setTimeout(resolve, 8000));

      const postLoginUrl = page.url();
      console.log(`[Valvest Scraper] URL after login: ${postLoginUrl}`);

      if (!postLoginUrl.includes("/account/portfolio")) {
        console.log("[Valvest Scraper] Not on portfolio page yet, navigating...");
        await page.goto(PORTFOLIO_URL, { waitUntil: "networkidle2", timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } else {
      console.log("[Valvest Scraper] No login form found, may already be authenticated or page structure unexpected");
      const pageText = await page.evaluate(`document.body.innerText.substring(0, 1000)`);
      console.log(`[Valvest Scraper] Page text: ${pageText}`);
    }

    const portfolioUrl = page.url();
    console.log(`[Valvest Scraper] Portfolio page URL: ${portfolioUrl}`);

    const pageCheck = await page.evaluate(`document.body.innerText.substring(0, 500)`);
    console.log(`[Valvest Scraper] Portfolio page content check: ${pageCheck}`);

    console.log("[Valvest Scraper] Extracting principal amount from portfolio page...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    const portfolioData = await page.evaluate(`(function() {
      var result = {
        principalAmount: null,
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

      var principalPatterns = [
        /(?:Principal|Hoofdsom|Principal amount|Hoofdbedrag)[\\s\\S]*?€\\s*([\\d.,]+)/i,
        /€\\s*([\\d.,]+)[\\s\\S]*?(?:principal|hoofdsom)/i,
      ];

      for (var i = 0; i < principalPatterns.length; i++) {
        var match = allText.match(principalPatterns[i]);
        if (match) {
          var num = extractNumber(match[1]);
          if (num !== null && num > 0) {
            result.principalAmount = num;
            break;
          }
        }
      }

      if (!result.principalAmount) {
        var findValueNearLabel = function(labelText) {
          var allElements = document.querySelectorAll('*');
          for (var i = 0; i < allElements.length; i++) {
            var el = allElements[i];
            if (el.children.length > 0) continue;
            var txt = el.textContent ? el.textContent.trim().toLowerCase() : "";
            if (txt.indexOf(labelText.toLowerCase()) === -1) continue;
            if (txt.length > labelText.length * 4) continue;

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

        var labels = ["principal", "hoofdsom", "principal amount", "hoofdbedrag",
                       "invested", "geïnvesteerd", "total invested", "totaal geïnvesteerd"];
        for (var i = 0; i < labels.length; i++) {
          var val = findValueNearLabel(labels[i]);
          if (val) {
            result.principalAmount = val;
            break;
          }
        }
      }

      if (!result.principalAmount) {
        var valuePatterns = [
          /(?:Portfolio|Portefeuille)\\s*(?:value|waarde)[\\s\\S]*?€\\s*([\\d.,]+)/i,
          /(?:Total|Totaal|Totale)\\s*(?:value|waarde|balance|saldo)[\\s\\S]*?€\\s*([\\d.,]+)/i,
          /(?:Current|Huidige|Huidig)\\s*(?:value|waarde|balance|saldo)[\\s\\S]*?€\\s*([\\d.,]+)/i,
        ];

        for (var i = 0; i < valuePatterns.length; i++) {
          var match = allText.match(valuePatterns[i]);
          if (match) {
            var num = extractNumber(match[1]);
            if (num !== null && num > 0) {
              result.principalAmount = num;
              break;
            }
          }
        }
      }

      if (!result.principalAmount) {
        var euroPattern = /€\\s*([\\d.,]+)/g;
        var candidates = [];
        var m;
        while ((m = euroPattern.exec(allText)) !== null) {
          var n = extractNumber(m[1]);
          if (n !== null && n > 100) {
            candidates.push(n);
          }
        }
        if (candidates.length > 0) {
          candidates.sort(function(a, b) { return b - a; });
          result.principalAmount = candidates[0];
        }
      }

      return result;
    })()`) as { principalAmount: number | null; debugText: string };

    console.log(`[Valvest Scraper] Raw extracted principal: ${portfolioData.principalAmount}`);
    console.log(`[Valvest Scraper] Page text preview: ${portfolioData.debugText.substring(0, 2000)}`);

    const totalBalance = portfolioData.principalAmount || 0;

    if (totalBalance === 0) {
      throw new Error("Could not extract principal amount from the portfolio page. The page structure may have changed.");
    }

    console.log(`[Valvest Scraper] Scraping complete. Principal amount: €${totalBalance}`);

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
