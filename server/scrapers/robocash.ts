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

    console.log("[RoboCash Scraper] Extracting balance from page...");

    // Dump page text and all numeric leaf nodes for diagnostics
    const diag = await page.evaluate(`(function() {
      var url = window.location.href;
      var bodyText = (document.body.innerText || "").substring(0, 1000);
      var nums = [];
      var allEls = document.querySelectorAll("*");
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        if (el.children.length > 0) continue;
        var t = (el.textContent || "").trim();
        if (/[0-9]/.test(t) && t.length < 40 && el.parentElement) {
          var cls = el.className || "";
          var par = (el.parentElement.textContent || "").trim().substring(0, 80);
          nums.push({ text: t, class: cls, parent: par });
        }
        if (nums.length >= 30) break;
      }
      return { url: url, bodyText: bodyText, nums: nums };
    })()`) as unknown as { url: string; bodyText: string; nums: Array<{text: string; class: string; parent: string}> };

    console.log("[RoboCash Scraper] Page URL:", diag.url);
    console.log("[RoboCash Scraper] Page text (first 1000):", diag.bodyText);
    console.log("[RoboCash Scraper] Numeric leaf nodes:", JSON.stringify(diag.nums));

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
        var allElements = document.querySelectorAll("*");
        for (var i = 0; i < allElements.length; i++) {
          var el = allElements[i];
          if (el.children.length > 0) continue;
          var txt = (el.textContent || "").trim().toLowerCase();
          if (txt.indexOf(labelText.toLowerCase()) === -1) continue;
          if (txt.length > labelText.length * 3) continue;
          var prev = el.previousElementSibling;
          if (prev) { var pv = extractNumber(prev.textContent); if (pv !== null) return pv; }
          var next = el.nextElementSibling;
          if (next) { var nv = extractNumber(next.textContent); if (nv !== null) return nv; }
          if (el.parentElement) {
            var sibs = Array.from(el.parentElement.children);
            for (var s = 0; s < sibs.length; s++) {
              if (sibs[s] !== el) { var sv = extractNumber(sibs[s].textContent); if (sv !== null) return sv; }
            }
            var pp = el.parentElement.previousElementSibling;
            if (pp) { var ppv = extractNumber(pp.textContent); if (ppv !== null) return ppv; }
            var pn = el.parentElement.nextElementSibling;
            if (pn) { var pnv = extractNumber(pn.textContent); if (pnv !== null) return pnv; }
          }
        }
        return null;
      };

      // Try known label patterns for the total portfolio balance
      var labelCandidates = [
        "total balance", "total funds", "portfolio", "net worth",
        "my balance", "account balance", "wallet", "total"
      ];
      for (var li = 0; li < labelCandidates.length; li++) {
        var lv = findValueNearLabel(labelCandidates[li]);
        if (lv !== null && lv > 0) {
          console.log("[RoboCash Scraper] Found via label '" + labelCandidates[li] + "': " + lv);
          return lv;
        }
      }

      // Try old .value_roundings class (legacy layout)
      var oldEls = document.querySelectorAll(".value_roundings");
      if (oldEls.length > 0) {
        var nums = [];
        for (var i = 0; i < oldEls.length; i++) {
          var n = extractNumber(oldEls[i].textContent);
          if (n !== null && n >= 0) nums.push(n);
        }
        if (nums.length > 0) {
          nums.sort(function(a, b) { return b - a; });
          console.log("[RoboCash Scraper] Found via .value_roundings: " + nums[0]);
          return nums[0];
        }
      }

      // Fallback: collect all numeric leaf nodes and return the largest >= 100
      var allEls = document.querySelectorAll("*");
      var allNums = [];
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        if (el.children.length > 0) continue;
        var t = (el.textContent || "").trim();
        if (t.length < 40) {
          var n = extractNumber(t);
          if (n !== null && n >= 100) allNums.push(n);
        }
      }
      if (allNums.length > 0) {
        allNums.sort(function(a, b) { return b - a; });
        console.log("[RoboCash Scraper] Fallback largest numeric: " + allNums[0]);
        return allNums[0];
      }

      return 0;
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
