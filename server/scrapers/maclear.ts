import puppeteer from "puppeteer-core";
import { getChromiumPath } from "./chromium";

export interface MaclearScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const LOGIN_URL = "https://app.maclear.ch/en/login";
const OVERVIEW_URL = "https://app.maclear.ch/en/overview";

export async function scrapeMaclear(email: string, password: string): Promise<MaclearScrapedData> {
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
        "--window-size=1280,800",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    console.log("[Maclear Scraper] Navigating to login page...");
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Diagnostic: log what inputs are available on the page
    const pageInputs = await page.evaluate(`(function() {
      return Array.from(document.querySelectorAll("input")).map(function(i) {
        return { id: i.id, name: i.name, type: i.type, className: i.className };
      });
    })()`) as Array<{ id: string; name: string; type: string; className: string }>;
    console.log("[Maclear Scraper] Inputs found on page:", JSON.stringify(pageInputs));
    console.log("[Maclear Scraper] Current URL:", page.url());

    // Try progressively broader selectors for the email field
    const emailSelector = '#email, input[name="Email"], input[name="email"], input[type="email"]';
    const passSelector = '#pass, input[name="pass"], input[name="password"], input[type="password"]';

    console.log("[Maclear Scraper] Waiting for login form...");
    await page.waitForSelector(emailSelector, { timeout: 20000 });

    console.log("[Maclear Scraper] Filling credentials...");
    const emailInput = await page.$(emailSelector);
    const passInput = await page.$(passSelector);
    if (!emailInput || !passInput) {
      throw new Error(`Login form fields not found. Inputs on page: ${JSON.stringify(pageInputs)}`);
    }

    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 50 });
    await passInput.click({ clickCount: 3 });
    await passInput.type(password, { delay: 50 });

    console.log("[Maclear Scraper] Submitting login...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
      page.click('button[type="submit"].button'),
    ]);
    await new Promise(resolve => setTimeout(resolve, 3000));

    const urlAfterLogin = page.url();
    console.log(`[Maclear Scraper] URL after login: ${urlAfterLogin}`);

    if (urlAfterLogin.includes("/login")) {
      const errorText = await page.evaluate(`(function() {
        var el = document.querySelector('.error, .alert, [class*="error"], [class*="alert"], .form__error');
        return el ? el.textContent.trim() : null;
      })()`);
      throw new Error(`Login failed${errorText ? ": " + errorText : ". Please check your credentials."}`);
    }

    // Dismiss post-login popup if present (X button in top-right corner of modal)
    console.log("[Maclear Scraper] Checking for post-login popup...");
    try {
      const popupClosed = await page.evaluate(`(function() {
        // Only search within modal/dialog/popup containers to avoid unintended clicks
        var containers = Array.from(document.querySelectorAll(
          '[class*="modal"], [class*="popup"], [class*="dialog"], [class*="overlay"], [role="dialog"]'
        ));
        for (var c = 0; c < containers.length; c++) {
          var container = containers[c];
          // Try aria-label close button first
          var ariaClose = container.querySelector('[aria-label="Close"], [aria-label="close"]');
          if (ariaClose) { ariaClose.click(); return true; }
          // Try class-based close button
          var classClose = container.querySelector('button[class*="close"], [class*="close-btn"], [class*="btn-close"]');
          if (classClose) { classClose.click(); return true; }
          // Try button containing only a close glyph
          var btns = Array.from(container.querySelectorAll('button, [role="button"]'));
          for (var j = 0; j < btns.length; j++) {
            var txt = (btns[j].textContent || "").trim();
            if (txt === "\u00d7" || txt === "\u2715" || txt === "\u2716" || txt === "&times;") {
              btns[j].click();
              return true;
            }
          }
        }
        return false;
      })()`);
      if (popupClosed) {
        console.log("[Maclear Scraper] Popup dismissed.");
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log("[Maclear Scraper] No popup found.");
      }
    } catch (popupErr) {
      console.log("[Maclear Scraper] Popup dismissal skipped:", popupErr);
    }

    // Navigate to overview if not already there
    if (!page.url().includes("/overview")) {
      console.log("[Maclear Scraper] Navigating to overview...");
      await page.goto(OVERVIEW_URL, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Dismiss popup again in case it appeared after navigation
    try {
      await page.evaluate(`(function() {
        var containers = Array.from(document.querySelectorAll(
          '[class*="modal"], [class*="popup"], [class*="dialog"], [class*="overlay"], [role="dialog"]'
        ));
        for (var c = 0; c < containers.length; c++) {
          var ariaClose = containers[c].querySelector('[aria-label="Close"], [aria-label="close"]');
          if (ariaClose) { ariaClose.click(); return; }
          var classClose = containers[c].querySelector('button[class*="close"], [class*="close-btn"], [class*="btn-close"]');
          if (classClose) { classClose.click(); return; }
          var btns = Array.from(containers[c].querySelectorAll('button, [role="button"]'));
          for (var j = 0; j < btns.length; j++) {
            var txt = (btns[j].textContent || "").trim();
            if (txt === "\u00d7" || txt === "\u2715" || txt === "\u2716") { btns[j].click(); return; }
          }
        }
      })()`);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (_) {}

    console.log("[Maclear Scraper] Waiting for overview statistics...");
    await page.waitForSelector(".overview-statistics__value-number", { timeout: 20000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Diagnostic dump
    const diag = await page.evaluate(`(function() {
      var url = window.location.href;
      var titles = Array.from(document.querySelectorAll('.overview-statistics__title')).map(function(el) {
        return el.textContent.trim();
      });
      var values = Array.from(document.querySelectorAll('.overview-statistics__value-number')).map(function(el) {
        return el.textContent.trim();
      });
      return { url: url, titles: titles, values: values };
    })()`) as { url: string; titles: string[]; values: string[] };
    console.log("[Maclear Scraper] URL:", diag.url);
    console.log("[Maclear Scraper] Stat titles:", JSON.stringify(diag.titles));
    console.log("[Maclear Scraper] Stat values:", JSON.stringify(diag.values));

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

      // Find the stat block whose h3.overview-statistics__title contains "Active investments"
      var titles = Array.from(document.querySelectorAll('.overview-statistics__title'));
      for (var i = 0; i < titles.length; i++) {
        var titleText = (titles[i].textContent || "").trim().toLowerCase();
        if (titleText.indexOf("active") > -1 && titleText.indexOf("invest") > -1) {
          // Look for the value in the same parent container
          var container = titles[i].parentElement;
          if (container) {
            var valEl = container.querySelector('.overview-statistics__value-number');
            if (valEl) {
              var val = extractNumber(valEl.textContent);
              if (val !== null) {
                console.log("[Maclear Scraper] Found 'Active investments' via container: " + val);
                return val;
              }
            }
          }
          // Try next sibling container
          var next = titles[i].nextElementSibling;
          while (next) {
            var nested = next.querySelector('.overview-statistics__value-number');
            if (nested) {
              var v = extractNumber(nested.textContent);
              if (v !== null) {
                console.log("[Maclear Scraper] Found 'Active investments' via sibling: " + v);
                return v;
              }
            }
            var direct = extractNumber(next.textContent);
            if (direct !== null && direct > 0) {
              console.log("[Maclear Scraper] Found 'Active investments' via next sibling direct: " + direct);
              return direct;
            }
            next = next.nextElementSibling;
          }
        }
      }

      // "Active investments" label was not found — throw to avoid silently returning wrong data
      throw new Error("Could not find 'Active investments' stat block on the overview page. The page layout may have changed.");
    })()`) as number;

    console.log(`[Maclear Scraper] Scraping complete. Active investments: €${totalBalance}`);

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
