import puppeteer from "puppeteer-core";
import { getChromiumPath } from "./chromium";

export interface ValvestScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const HOME_URL = "https://www.landed.eu/";
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

    console.log("[Valvest Scraper] Step 1: Navigating to landed.eu homepage...");
    await page.goto(HOME_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`[Valvest Scraper] Current URL: ${page.url()}`);

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
    } catch (e) {}

    console.log("[Valvest Scraper] Step 2: Clicking Login link on homepage...");
    const loginClicked = await page.evaluate(`(function() {
      var links = Array.from(document.querySelectorAll('a, button'));
      for (var i = 0; i < links.length; i++) {
        var t = links[i].textContent ? links[i].textContent.trim() : "";
        var href = links[i].getAttribute('href') || "";
        if (t === 'Login' || t === 'Log in' || t === 'Inloggen' || href.includes('/login') || href.includes('/auth')) {
          links[i].click();
          return t + ' (' + href + ')';
        }
      }
      return false;
    })()`);
    console.log(`[Valvest Scraper] Login link clicked: ${loginClicked}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log(`[Valvest Scraper] URL after clicking login: ${page.url()}`);

    console.log("[Valvest Scraper] Step 3: Waiting for email input (#auth-email)...");
    try {
      await page.waitForSelector('#auth-email', { visible: true, timeout: 15000 });
    } catch (e) {
      const inputs = await page.evaluate(`(function() {
        return Array.from(document.querySelectorAll('input')).map(function(i) {
          return { id: i.id, name: i.name, type: i.type, placeholder: i.placeholder };
        });
      })()`);
      const allButtons = await page.evaluate(`(function() {
        return Array.from(document.querySelectorAll('button, a')).slice(0, 20).map(function(b) {
          return { tag: b.tagName, text: (b.textContent || '').trim().substring(0, 50), href: b.getAttribute('href') || '' };
        });
      })()`);
      console.log(`[Valvest Scraper] Available inputs: ${JSON.stringify(inputs)}`);
      console.log(`[Valvest Scraper] Available buttons/links: ${JSON.stringify(allButtons)}`);
      throw new Error("Could not find email input #auth-email on login page");
    }

    console.log("[Valvest Scraper] Step 4: Entering email...");
    const emailInput = await page.$('#auth-email');
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(email, { delay: 50 });
    }

    console.log("[Valvest Scraper] Step 5: Clicking Continue button...");
    const allButtonsBefore = await page.evaluate(`(function() {
      return Array.from(document.querySelectorAll('button')).map(function(b) {
        return { text: (b.textContent || '').trim(), type: b.type, disabled: b.disabled };
      });
    })()`);
    console.log(`[Valvest Scraper] Available buttons: ${JSON.stringify(allButtonsBefore)}`);

    const continueClicked = await page.evaluate(`(function() {
      var buttons = Array.from(document.querySelectorAll('button'));
      for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
        if (t === 'continue' || t === 'verder' || t === 'volgende' || t === 'next' || t === 'doorgaan') {
          buttons[i].click();
          return t;
        }
      }
      var submitBtns = Array.from(document.querySelectorAll('button[type="submit"]'));
      if (submitBtns.length > 0) {
        submitBtns[0].click();
        return 'submit: ' + (submitBtns[0].textContent || '').trim();
      }
      return false;
    })()`);
    console.log(`[Valvest Scraper] Continue button result: ${continueClicked}`);

    if (!continueClicked) {
      console.log("[Valvest Scraper] No continue button found, pressing Enter...");
      await page.keyboard.press("Enter");
    }

    console.log("[Valvest Scraper] Step 6: Waiting for password field (#login-password)...");
    try {
      await page.waitForSelector('#login-password', { visible: true, timeout: 15000 });
    } catch (e) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const pwCheck = await page.$('#login-password');
      if (!pwCheck) {
        const inputs2 = await page.evaluate(`(function() {
          return Array.from(document.querySelectorAll('input')).map(function(i) {
            return { id: i.id, name: i.name, type: i.type, placeholder: i.placeholder };
          });
        })()`);
        const pageText = await page.evaluate(`document.body.innerText.substring(0, 1000)`);
        console.log(`[Valvest Scraper] Inputs after continue: ${JSON.stringify(inputs2)}`);
        console.log(`[Valvest Scraper] Page text after continue: ${pageText}`);
        throw new Error("Password field #login-password did not appear after clicking Continue");
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log("[Valvest Scraper] Step 7: Entering password...");
    const pwInput = await page.$('#login-password');
    if (!pwInput) {
      throw new Error("Password field #login-password not found");
    }
    await pwInput.click({ clickCount: 3 });
    await pwInput.type(password, { delay: 50 });

    console.log("[Valvest Scraper] Step 8: Submitting login form...");
    const allButtonsLogin = await page.evaluate(`(function() {
      return Array.from(document.querySelectorAll('button')).map(function(b) {
        return { text: (b.textContent || '').trim(), type: b.type, disabled: b.disabled };
      });
    })()`);
    console.log(`[Valvest Scraper] Buttons on password page: ${JSON.stringify(allButtonsLogin)}`);

    const loginClicked2 = await page.evaluate(`(function() {
      var buttons = Array.from(document.querySelectorAll('button'));
      for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
        if (t === 'log in' || t === 'login' || t === 'sign in' || t === 'inloggen' || t === 'continue' || t === 'doorgaan') {
          buttons[i].click();
          return t;
        }
      }
      var submitBtns = Array.from(document.querySelectorAll('button[type="submit"]'));
      if (submitBtns.length > 0) {
        submitBtns[0].click();
        return 'submit: ' + (submitBtns[0].textContent || '').trim();
      }
      return false;
    })()`);
    console.log(`[Valvest Scraper] Login submit result: ${loginClicked2}`);

    if (!loginClicked2) {
      console.log("[Valvest Scraper] No login button found, pressing Enter...");
      await page.keyboard.press("Enter");
    }

    console.log("[Valvest Scraper] Step 9: Waiting for login to complete...");
    await new Promise(resolve => setTimeout(resolve, 8000));

    const postLoginUrl = page.url();
    const postLoginText = await page.evaluate(`document.body.innerText.substring(0, 1500)`) as string;
    console.log(`[Valvest Scraper] URL after login: ${postLoginUrl}`);
    console.log(`[Valvest Scraper] Page text after login: ${postLoginText.substring(0, 500)}`);

    const stillOnLoginPage = postLoginText.includes("Easily invest in rental real estate") && 
                             (postLoginText.includes("Login") || postLoginText.includes("Register"));
    
    const hasErrorMsg = await page.evaluate(`(function() {
      var errorEls = document.querySelectorAll('[class*="error"], [class*="alert"], [role="alert"], .text-red, .text-danger');
      for (var i = 0; i < errorEls.length; i++) {
        var t = (errorEls[i].textContent || '').trim();
        if (t.length > 0 && t.length < 200) return t;
      }
      return null;
    })()`) as string | null;
    
    if (hasErrorMsg) {
      console.log(`[Valvest Scraper] Error message found: ${hasErrorMsg}`);
    }

    if (stillOnLoginPage) {
      console.log("[Valvest Scraper] WARNING: Still on landing page after login attempt. Login may have failed.");
      const allLinks = await page.evaluate(`(function() {
        return Array.from(document.querySelectorAll('a')).slice(0, 30).map(function(a) {
          return { text: (a.textContent || '').trim().substring(0, 40), href: a.getAttribute('href') || '' };
        });
      })()`);
      console.log(`[Valvest Scraper] Links on page: ${JSON.stringify(allLinks)}`);
    }

    console.log("[Valvest Scraper] Step 10: Navigating to portfolio page...");
    await page.goto(PORTFOLIO_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    const portfolioUrl = page.url();
    console.log(`[Valvest Scraper] Portfolio page URL: ${portfolioUrl}`);

    if (!portfolioUrl.includes("/account/portfolio")) {
      console.log("[Valvest Scraper] Redirected away from portfolio, login likely failed.");
      const redirectText = await page.evaluate(`document.body.innerText.substring(0, 500)`) as string;
      console.log(`[Valvest Scraper] Redirect page text: ${redirectText}`);
      throw new Error(`Login failed - redirected to ${portfolioUrl} instead of portfolio page. Check credentials.`);
    }

    console.log("[Valvest Scraper] Step 11: Extracting principal amount...");
    await new Promise(resolve => setTimeout(resolve, 3000));

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
