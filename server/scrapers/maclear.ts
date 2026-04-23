import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { getChromiumPath } from "./chromium";
import { getProxyArgs, applyProxy } from "./proxy";

puppeteer.use(StealthPlugin());

export interface MaclearScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const LOGIN_URL = "https://app.maclear.ch/en/login";
const OVERVIEW_URL = "https://app.maclear.ch/en/overview";

export async function scrapeMaclear(email: string, password: string): Promise<MaclearScrapedData> {
  let browser: any;
  try {
    browser = await (puppeteer as any).launch({
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
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--mute-audio",
        "--hide-scrollbars",
        "--disable-software-rasterizer",
        "--disable-features=site-per-process",
        "--js-flags=--max-old-space-size=256",
        "--window-size=1280,800",
        ...getProxyArgs(),
      ],
    });

    const page = await browser.newPage();
    await applyProxy(page);
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    console.log("[Maclear Scraper] Navigating to login page...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log("[Maclear Scraper] Current URL:", page.url());

    const emailSelector = 'input[type="email"], input[name="email"], input[id="email"]';
    const passSelector = 'input[type="password"], input[name="password"], input[id="password"]';

    console.log("[Maclear Scraper] Waiting for login form...");
    await page.waitForSelector(emailSelector, { timeout: 30000 }).catch(async () => {
      const html = await page.evaluate(`document.body ? document.body.innerHTML.slice(0, 1000) : "no body"`);
      throw new Error(`Login email field not found. Page HTML: ${html}`);
    });
    await page.waitForSelector(passSelector, { timeout: 10000 }).catch(async () => {
      throw new Error("Login password field not found. The login form may have changed.");
    });

    console.log("[Maclear Scraper] Filling credentials...");
    await page.$eval(emailSelector, (el: HTMLInputElement) => { el.value = ""; });
    await page.type(emailSelector, email, { delay: 50 });
    await page.$eval(passSelector, (el: HTMLInputElement) => { el.value = ""; });
    await page.type(passSelector, password, { delay: 50 });

    console.log("[Maclear Scraper] Submitting login...");
    const submitButton = await page.$('button[type="submit"]');
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
      submitButton ? submitButton.click() : page.keyboard.press("Enter"),
    ]);
    await new Promise(resolve => setTimeout(resolve, 3000));

    const urlAfterLogin = page.url();
    console.log("[Maclear Scraper] URL after login:", urlAfterLogin);

    if (urlAfterLogin.includes("/login")) {
      const errorText = await page.evaluate(`(function() {
        var el = document.querySelector('.error, .alert, [class*="error"], [class*="alert"]');
        return el ? el.textContent.trim() : null;
      })()`);
      throw new Error(`Login failed${errorText ? ": " + errorText : ". Please check your credentials."}`);
    }

    // Dismiss post-login popup if present
    try {
      const popupClosed = await page.evaluate(`(function() {
        var containers = Array.from(document.querySelectorAll(
          '[class*="modal"], [class*="popup"], [class*="dialog"], [class*="overlay"], [role="dialog"]'
        ));
        for (var c = 0; c < containers.length; c++) {
          var container = containers[c];
          var ariaClose = container.querySelector('[aria-label="Close"], [aria-label="close"]');
          if (ariaClose) { ariaClose.click(); return true; }
          var classClose = container.querySelector('button[class*="close"], [class*="close-btn"], [class*="btn-close"]');
          if (classClose) { classClose.click(); return true; }
          var btns = Array.from(container.querySelectorAll('button, [role="button"]'));
          for (var j = 0; j < btns.length; j++) {
            var txt = (btns[j].textContent || "").trim();
            if (txt === "\\u00d7" || txt === "\\u2715" || txt === "\\u2716") { btns[j].click(); return true; }
          }
        }
        return false;
      })()`);
      if (popupClosed) {
        console.log("[Maclear Scraper] Popup dismissed.");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (_) {}

    if (!urlAfterLogin.includes("/overview")) {
      console.log("[Maclear Scraper] Navigating to overview...");
      await page.goto(OVERVIEW_URL, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Dismiss popup again after navigation
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
            if (txt === "\\u00d7" || txt === "\\u2715" || txt === "\\u2716") { btns[j].click(); return; }
          }
        }
      })()`);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (_) {}

    console.log("[Maclear Scraper] Waiting for overview statistics...");
    await page.waitForSelector(".overview-statistics__value-number", { timeout: 20000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));

    const diag = await page.evaluate(`(function() {
      var titles = Array.from(document.querySelectorAll('.overview-statistics__title')).map(function(el) { return el.textContent.trim(); });
      var values = Array.from(document.querySelectorAll('.overview-statistics__value-number')).map(function(el) { return el.textContent.trim(); });
      return { url: window.location.href, titles: titles, values: values };
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

      var titles = Array.from(document.querySelectorAll('.overview-statistics__title'));
      for (var i = 0; i < titles.length; i++) {
        var titleText = (titles[i].textContent || "").trim().toLowerCase();
        if (titleText.indexOf("active") > -1 && titleText.indexOf("invest") > -1) {
          var container = titles[i].parentElement;
          if (container) {
            var valEl = container.querySelector('.overview-statistics__value-number');
            if (valEl) {
              var val = extractNumber(valEl.textContent);
              if (val !== null) return val;
            }
          }
          var next = titles[i].nextElementSibling;
          while (next) {
            var nested = next.querySelector('.overview-statistics__value-number');
            if (nested) {
              var v = extractNumber(nested.textContent);
              if (v !== null) return v;
            }
            next = next.nextElementSibling;
          }
        }
      }

      throw new Error("Could not find 'Active investments' stat block. Titles found: " + Array.from(document.querySelectorAll('.overview-statistics__title')).map(function(el) { return el.textContent.trim(); }).join(", "));
    })()`) as number;

    console.log(`[Maclear Scraper] Scraping complete. Active investments: €${totalBalance}`);

    return { totalBalance, scrapedAt: new Date() };

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
