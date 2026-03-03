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

    const authResponses: { url: string; status: number; body?: string }[] = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('auth') || url.includes('login') || url.includes('session') || url.includes('token') || url.includes('api')) {
        try {
          const body = await response.text().catch(() => '');
          authResponses.push({ url, status: response.status(), body: body.substring(0, 500) });
        } catch {
          authResponses.push({ url, status: response.status() });
        }
      }
    });

    console.log("[Valvest Scraper] Step 1: Navigating to landed.eu homepage...");
    await page.goto(HOME_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`[Valvest Scraper] Homepage loaded. URL: ${page.url()}`);

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

    console.log("[Valvest Scraper] Step 2: Looking for Login button...");
    const loginBtnInfo = await page.evaluate(`(function() {
      var elements = Array.from(document.querySelectorAll('button, a'));
      var found = [];
      for (var i = 0; i < elements.length; i++) {
        var t = elements[i].textContent ? elements[i].textContent.trim() : "";
        var href = elements[i].getAttribute('href') || "";
        var tag = elements[i].tagName;
        if (t === 'Login' || t === 'Log in' || t === 'Inloggen') {
          found.push({ tag: tag, text: t, href: href, index: i });
        }
      }
      return found;
    })()`) as Array<{ tag: string; text: string; href: string; index: number }>;
    console.log(`[Valvest Scraper] Found login elements: ${JSON.stringify(loginBtnInfo)}`);

    const loginClicked = await page.evaluate(`(function() {
      var elements = Array.from(document.querySelectorAll('button, a'));
      for (var i = 0; i < elements.length; i++) {
        var t = elements[i].textContent ? elements[i].textContent.trim() : "";
        if (t === 'Login' || t === 'Log in' || t === 'Inloggen') {
          elements[i].click();
          return t + ' (' + elements[i].tagName + ')';
        }
      }
      return false;
    })()`);
    console.log(`[Valvest Scraper] Login button clicked: ${loginClicked}`);

    if (!loginClicked) {
      throw new Error("Could not find Login button on the homepage");
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("[Valvest Scraper] Step 3: Waiting for email input...");
    let emailSelector = '#auth-email';
    try {
      await page.waitForSelector(emailSelector, { visible: true, timeout: 10000 });
    } catch (e) {
      const allInputs = await page.evaluate(`(function() {
        return Array.from(document.querySelectorAll('input')).map(function(i) {
          return { id: i.id, name: i.name, type: i.type, placeholder: i.placeholder, visible: i.offsetParent !== null };
        });
      })()`) as Array<{ id: string; name: string; type: string; placeholder: string; visible: boolean }>;
      console.log(`[Valvest Scraper] Available inputs: ${JSON.stringify(allInputs)}`);

      const visibleEmailInput = allInputs.find(i =>
        i.visible && (i.type === 'email' || i.name === 'email' || i.id.includes('email') || i.placeholder.toLowerCase().includes('email'))
      );
      if (visibleEmailInput) {
        emailSelector = visibleEmailInput.id ? `#${visibleEmailInput.id}` :
          visibleEmailInput.name ? `input[name="${visibleEmailInput.name}"]` :
          `input[type="${visibleEmailInput.type}"]`;
        console.log(`[Valvest Scraper] Using fallback email selector: ${emailSelector}`);
      } else {
        const modalContent = await page.evaluate(`(function() {
          var modals = document.querySelectorAll('[class*="modal"], [class*="dialog"], [role="dialog"], [class*="overlay"]');
          var texts = [];
          for (var i = 0; i < modals.length; i++) {
            texts.push(modals[i].textContent ? modals[i].textContent.trim().substring(0, 200) : '');
          }
          return { modalCount: modals.length, texts: texts };
        })()`) as { modalCount: number; texts: string[] };
        console.log(`[Valvest Scraper] Modals found: ${JSON.stringify(modalContent)}`);

        const iframes = await page.frames();
        console.log(`[Valvest Scraper] Frames: ${iframes.length} (${iframes.map(f => f.url()).join(', ')})`);

        throw new Error(`Could not find email input. Available inputs: ${JSON.stringify(allInputs)}`);
      }
    }

    console.log(`[Valvest Scraper] Step 4: Entering email into ${emailSelector}...`);
    const emailInput = await page.$(emailSelector);
    if (!emailInput) {
      throw new Error(`Email input ${emailSelector} not found after waitForSelector succeeded`);
    }
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 30 });
    console.log("[Valvest Scraper] Email entered");

    console.log("[Valvest Scraper] Step 5: Clicking Continue...");
    const buttonsBeforeContinue = await page.evaluate(`(function() {
      return Array.from(document.querySelectorAll('button')).filter(function(b) {
        return b.offsetParent !== null;
      }).map(function(b) {
        return { text: (b.textContent || '').trim(), type: b.type, disabled: b.disabled };
      });
    })()`) as Array<{ text: string; type: string; disabled: boolean }>;
    console.log(`[Valvest Scraper] Visible buttons: ${JSON.stringify(buttonsBeforeContinue)}`);

    const continueClicked = await page.evaluate(`(function() {
      var buttons = Array.from(document.querySelectorAll('button')).filter(function(b) { return b.offsetParent !== null; });
      for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
        if (t === 'continue' || t === 'verder' || t === 'volgende' || t === 'next' || t === 'doorgaan') {
          buttons[i].click();
          return t;
        }
      }
      var submitBtns = buttons.filter(function(b) { return b.type === 'submit'; });
      if (submitBtns.length > 0) {
        submitBtns[0].click();
        return 'submit: ' + (submitBtns[0].textContent || '').trim();
      }
      return false;
    })()`);
    console.log(`[Valvest Scraper] Continue result: ${continueClicked}`);

    if (!continueClicked) {
      console.log("[Valvest Scraper] No continue button found, trying Enter key...");
      await page.keyboard.press("Enter");
    }

    console.log("[Valvest Scraper] Step 6: Waiting for password field...");
    let pwSelector = '#login-password';
    try {
      await page.waitForSelector(pwSelector, { visible: true, timeout: 15000 });
    } catch (e) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const allInputs2 = await page.evaluate(`(function() {
        return Array.from(document.querySelectorAll('input')).map(function(i) {
          return { id: i.id, name: i.name, type: i.type, placeholder: i.placeholder, visible: i.offsetParent !== null };
        });
      })()`) as Array<{ id: string; name: string; type: string; placeholder: string; visible: boolean }>;
      console.log(`[Valvest Scraper] Inputs after continue: ${JSON.stringify(allInputs2)}`);

      const visiblePwInput = allInputs2.find(i => i.visible && i.type === 'password');
      if (visiblePwInput) {
        pwSelector = visiblePwInput.id ? `#${visiblePwInput.id}` :
          visiblePwInput.name ? `input[name="${visiblePwInput.name}"]` : 'input[type="password"]';
        console.log(`[Valvest Scraper] Using fallback password selector: ${pwSelector}`);
      } else {
        const pageText = await page.evaluate(`document.body.innerText.substring(0, 1000)`) as string;
        console.log(`[Valvest Scraper] Page text: ${pageText}`);
        throw new Error("Password field did not appear after clicking Continue");
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`[Valvest Scraper] Step 7: Entering password into ${pwSelector}...`);
    const pwInput = await page.$(pwSelector);
    if (!pwInput) {
      throw new Error(`Password input ${pwSelector} not found`);
    }
    await pwInput.click({ clickCount: 3 });
    await pwInput.type(password, { delay: 30 });
    console.log("[Valvest Scraper] Password entered");

    console.log("[Valvest Scraper] Step 8: Submitting login...");
    const buttonsBeforeLogin = await page.evaluate(`(function() {
      return Array.from(document.querySelectorAll('button')).filter(function(b) {
        return b.offsetParent !== null;
      }).map(function(b) {
        return { text: (b.textContent || '').trim(), type: b.type, disabled: b.disabled };
      });
    })()`) as Array<{ text: string; type: string; disabled: boolean }>;
    console.log(`[Valvest Scraper] Visible buttons before login: ${JSON.stringify(buttonsBeforeLogin)}`);

    authResponses.length = 0;

    const loginSubmitted = await page.evaluate(`(function() {
      var buttons = Array.from(document.querySelectorAll('button')).filter(function(b) { return b.offsetParent !== null; });
      for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
        if (t === 'log in' || t === 'login' || t === 'sign in' || t === 'inloggen' || t === 'continue' || t === 'doorgaan') {
          buttons[i].click();
          return t;
        }
      }
      var submitBtns = buttons.filter(function(b) { return b.type === 'submit'; });
      if (submitBtns.length > 0) {
        submitBtns[0].click();
        return 'submit: ' + (submitBtns[0].textContent || '').trim();
      }
      return false;
    })()`);
    console.log(`[Valvest Scraper] Login submit result: ${loginSubmitted}`);

    if (!loginSubmitted) {
      console.log("[Valvest Scraper] No login button found, trying Enter key...");
      await page.keyboard.press("Enter");
    }

    console.log("[Valvest Scraper] Step 9: Waiting for authentication to complete...");

    let authSucceeded = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const hasAccountLink = await page.evaluate(`(function() {
        var links = Array.from(document.querySelectorAll('a'));
        for (var i = 0; i < links.length; i++) {
          var href = links[i].getAttribute('href') || '';
          if (href.includes('/account') || href.includes('/portfolio') || href.includes('/dashboard')) {
            return href;
          }
        }
        var loginBtn = Array.from(document.querySelectorAll('button')).find(function(b) {
          var t = (b.textContent || '').trim().toLowerCase();
          return t === 'login' || t === 'log in' || t === 'inloggen';
        });
        if (!loginBtn) return 'no-login-button-visible';
        return null;
      })()`) as string | null;

      if (hasAccountLink) {
        console.log(`[Valvest Scraper] Auth indicator detected after ${attempt + 1}s: ${hasAccountLink}`);
        authSucceeded = true;
        break;
      }

      const errorOnPage = await page.evaluate(`(function() {
        var errorEls = document.querySelectorAll('[class*="error"], [role="alert"], [class*="alert-danger"]');
        for (var i = 0; i < errorEls.length; i++) {
          var t = (errorEls[i].textContent || '').trim();
          if (t.length > 0 && t.length < 300) return t;
        }
        return null;
      })()`) as string | null;

      if (errorOnPage) {
        console.log(`[Valvest Scraper] Error on page: ${errorOnPage}`);
        throw new Error(`Login failed with error: ${errorOnPage}`);
      }

      if (attempt === 9) {
        console.log(`[Valvest Scraper] Still waiting after ${attempt + 1}s...`);
        console.log(`[Valvest Scraper] Auth API responses so far: ${JSON.stringify(authResponses.slice(-5))}`);
      }
    }

    if (!authSucceeded) {
      console.log(`[Valvest Scraper] Auth responses captured: ${JSON.stringify(authResponses)}`);
      const pageText = await page.evaluate(`document.body.innerText.substring(0, 1500)`) as string;
      console.log(`[Valvest Scraper] Page text after 20s wait: ${pageText.substring(0, 500)}`);

      const cookies = await page.cookies();
      const authCookies = cookies.filter(c =>
        c.name.toLowerCase().includes('session') ||
        c.name.toLowerCase().includes('token') ||
        c.name.toLowerCase().includes('auth') ||
        c.name.toLowerCase().includes('user')
      );
      console.log(`[Valvest Scraper] Auth-related cookies: ${JSON.stringify(authCookies.map(c => ({ name: c.name, domain: c.domain })))}`);
    }

    console.log("[Valvest Scraper] Step 10: Navigating to portfolio page...");
    await page.goto(PORTFOLIO_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    const portfolioUrl = page.url();
    console.log(`[Valvest Scraper] Portfolio page URL: ${portfolioUrl}`);

    if (!portfolioUrl.includes("/account")) {
      const cookies = await page.cookies();
      console.log(`[Valvest Scraper] All cookies: ${JSON.stringify(cookies.map(c => ({ name: c.name, domain: c.domain, value: c.value.substring(0, 20) + '...' })))}`);
      console.log(`[Valvest Scraper] Auth responses: ${JSON.stringify(authResponses)}`);
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
