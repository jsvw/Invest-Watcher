import puppeteer from "puppeteer-core";

export interface CrowdPearScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const LOGIN_URL = "https://crowdpear.com/en/client";

export async function scrapeCrowdPear(email: string, password: string): Promise<CrowdPearScrapedData> {
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

    console.log("[CrowdPear Scraper] Navigating to login page...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("[CrowdPear Scraper] Dismissing cookie consent if present...");
    try {
      await page.evaluate(`(function() {
        var btns = Array.from(document.querySelectorAll('button, a'));
        for (var i = 0; i < btns.length; i++) {
          var t = btns[i].textContent ? btns[i].textContent.toLowerCase().trim() : "";
          if (t.includes('accept') || t.includes('allow all') || t.includes('agree') || t.includes('got it') || t.includes('ok')) {
            btns[i].click();
            break;
          }
        }
      })()`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (cookieErr) {
      console.log("[CrowdPear Scraper] Cookie banner handling skipped");
    }

    console.log("[CrowdPear Scraper] Waiting for login form...");
    await page.waitForSelector('input[type="email"], input[id="email"], input[name="email"], input[placeholder*="mail"]', { timeout: 15000 }).catch(() => {});

    const availableInputs = await page.evaluate(`(function() {
      return Array.from(document.querySelectorAll('input')).map(function(i) {
        return { name: i.name, type: i.type, id: i.id, placeholder: i.placeholder, className: i.className };
      });
    })()`) as Array<{ name: string; type: string; id: string; placeholder: string; className: string }>;
    console.log("[CrowdPear Scraper] Available inputs:", JSON.stringify(availableInputs));

    console.log("[CrowdPear Scraper] Filling login form...");
    const emailInput = await page.$('input[type="email"]')
      || await page.$('input[id="email"]')
      || await page.$('input[name="email"]')
      || await page.$('input[placeholder*="mail"]');

    const passwordInput = await page.$('input[type="password"]')
      || await page.$('input[name="password"]')
      || await page.$('input[id="password"]');

    if (!emailInput || !passwordInput) {
      throw new Error(`Could not find login fields. Available inputs: ${JSON.stringify(availableInputs)}`);
    }

    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 50 });
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    console.log("[CrowdPear Scraper] Submitting login...");
    const submitted = await page.evaluate(`(function() {
      var buttons = Array.from(document.querySelectorAll('button[type="submit"], button'));
      for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
        if (t === 'sign in' || t === 'log in' || t === 'login') {
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

    if (!submitted) {
      await page.keyboard.press("Enter");
    }

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {
      console.log("[CrowdPear Scraper] Navigation event not fired (SPA), continuing...");
    });

    console.log("[CrowdPear Scraper] Waiting for authenticated content to appear...");
    let authenticated = false;
    try {
      await page.waitForFunction(`(function() {
        var signInForm = document.querySelector('button');
        var btns = Array.from(document.querySelectorAll('button'));
        var hasSignIn = btns.some(function(b) { 
          var t = (b.textContent || '').trim().toLowerCase();
          return t === 'sign in' || t === 'log in';
        });
        var hasBalance = document.querySelector('[class*="Balance_balance"], [class*="balance"]');
        var hasNav = document.querySelector('[class*="Menu"], [class*="sidebar"], nav, [class*="Dashboard"]');
        return !hasSignIn || hasBalance || hasNav;
      })()`, { timeout: 20000 });
      authenticated = true;
    } catch {
      console.log("[CrowdPear Scraper] Timed out waiting for authenticated content");
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    console.log(`[CrowdPear Scraper] Current URL after login: ${currentUrl}`);

    if (!authenticated) {
      const pageText = await page.evaluate(`document.body.innerText.substring(0, 500)`) as string;
      console.log(`[CrowdPear Scraper] Page text: ${pageText.substring(0, 200)}`);
      if (pageText.toLowerCase().includes("sign in") || pageText.toLowerCase().includes("enter your details")) {
        const errorText = await page.evaluate(`(function() {
          var errorEl = document.querySelector('.ant-alert, .ant-message, .ant-notification, [class*="error"], [class*="alert"], [role="alert"]');
          return errorEl ? errorEl.textContent.trim() : null;
        })()`);
        throw new Error(`Login failed${errorText ? `: ${errorText}` : ". Check your credentials."}`);
      }
    }

    console.log("[CrowdPear Scraper] Waiting for balance element...");
    try {
      await page.waitForSelector('.Balance_balance__-D0Zw, [class*="Balance_balance"]', { timeout: 15000 });
      console.log("[CrowdPear Scraper] Balance element found");
    } catch {
      console.log("[CrowdPear Scraper] Primary balance selector not found, will try fallbacks");
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

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

      var balanceEl = document.querySelector('.Balance_balance__-D0Zw');
      if (balanceEl) {
        var num = extractNumber(balanceEl.textContent);
        if (num !== null && num > 0) return num;
      }

      var balanceEls = document.querySelectorAll('[class*="Balance_balance"]');
      for (var i = 0; i < balanceEls.length; i++) {
        var n = extractNumber(balanceEls[i].textContent);
        if (n !== null && n > 0) return n;
      }

      var antTypoEls = document.querySelectorAll('.ant-typography');
      var candidates = [];
      for (var j = 0; j < antTypoEls.length; j++) {
        var txt = antTypoEls[j].textContent || "";
        if (txt.match(/[\\d.,]+/) && (txt.includes("€") || txt.includes("EUR"))) {
          var amount = extractNumber(txt);
          if (amount !== null && amount > 0) {
            candidates.push(amount);
          }
        }
      }
      if (candidates.length > 0) {
        candidates.sort(function(a, b) { return b - a; });
        return candidates[0];
      }

      var allEls = document.querySelectorAll('[class*="balance"], [class*="Balance"], [class*="total"], [class*="Total"]');
      for (var k = 0; k < allEls.length; k++) {
        var val = extractNumber(allEls[k].textContent);
        if (val !== null && val > 0) return val;
      }

      var pageContent = document.body.innerHTML;
      var euroPattern = /€\\s*([\\d.,]+)/g;
      var euroMatches = [];
      var m;
      while ((m = euroPattern.exec(pageContent)) !== null) {
        var parsed = extractNumber(m[1]);
        if (parsed !== null && parsed > 0) euroMatches.push(parsed);
      }
      if (euroMatches.length > 0) {
        euroMatches.sort(function(a, b) { return b - a; });
        return euroMatches[0];
      }

      return 0;
    })()`) as number;

    console.log(`[CrowdPear Scraper] Scraping complete. Total balance: €${totalBalance}`);

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
