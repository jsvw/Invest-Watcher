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
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("[Maclear Scraper] Waiting for login form...");
    await page.waitForSelector("#email", { timeout: 15000 }).catch(() => {});

    console.log("[Maclear Scraper] Filling credentials...");
    await page.click("#email", { clickCount: 3 });
    await page.type("#email", email, { delay: 50 });
    await page.click("#pass", { clickCount: 3 });
    await page.type("#pass", password, { delay: 50 });

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

    // Dismiss post-login popup if present (X button in top-right corner)
    console.log("[Maclear Scraper] Checking for post-login popup...");
    try {
      const popupClosed = await page.evaluate(`(function() {
        var selectors = [
          'button[class*="close"]',
          '[aria-label="Close"]',
          '[aria-label="close"]',
          '.modal__close',
          '.popup__close',
          '.dialog__close',
          '[class*="modal"] button[class*="close"]',
          '[class*="popup"] button[class*="close"]',
        ];
        for (var i = 0; i < selectors.length; i++) {
          var btn = document.querySelector(selectors[i]);
          if (btn) { btn.click(); return true; }
        }
        // Look for a button containing × or ✕ or × inside a modal/overlay
        var allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (var j = 0; j < allBtns.length; j++) {
          var txt = (allBtns[j].textContent || "").trim();
          if (txt === "×" || txt === "✕" || txt === "✖" || txt === "×") {
            allBtns[j].click();
            return true;
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
        var selectors = [
          'button[class*="close"]',
          '[aria-label="Close"]',
          '[aria-label="close"]',
          '.modal__close',
          '.popup__close',
          '.dialog__close',
        ];
        for (var i = 0; i < selectors.length; i++) {
          var btn = document.querySelector(selectors[i]);
          if (btn) { btn.click(); return; }
        }
        var allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (var j = 0; j < allBtns.length; j++) {
          var txt = (allBtns[j].textContent || "").trim();
          if (txt === "×" || txt === "✕" || txt === "✖" || txt === "×") {
            allBtns[j].click();
            return;
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

      // Fallback: first .overview-statistics__value-number on the page
      var firstVal = document.querySelector('.overview-statistics__value-number');
      if (firstVal) {
        var fv = extractNumber(firstVal.textContent);
        if (fv !== null && fv > 0) {
          console.log("[Maclear Scraper] Fallback to first value-number: " + fv);
          return fv;
        }
      }

      return 0;
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
