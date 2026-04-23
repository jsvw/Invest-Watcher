import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { getChromiumPath } from "./chromium";
import { getProxyArgs, applyProxy } from "./proxy";

puppeteer.use(StealthPlugin());

export interface MaclearScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const OVERVIEW_URL = "https://app.maclear.ch/en/overview";

function parseCookieString(cookieStr: string): Array<{ name: string; value: string; domain: string; path: string }> {
  return cookieStr
    .split(";")
    .map(part => {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) return null;
      const name = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      if (!name) return null;
      return { name, value, domain: ".maclear.ch", path: "/" };
    })
    .filter(Boolean) as Array<{ name: string; value: string; domain: string; path: string }>;
}

export async function scrapeMaclear(cookies: string): Promise<MaclearScrapedData> {
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

    const parsedCookies = parseCookieString(cookies);
    console.log(`[Maclear Scraper] Injecting ${parsedCookies.length} cookies...`);
    if (parsedCookies.length === 0) {
      throw new Error("No valid cookies found. Please paste the full Cookie header value from your browser.");
    }
    await page.setCookie(...parsedCookies);

    console.log("[Maclear Scraper] Navigating to overview...");
    await page.goto(OVERVIEW_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    console.log(`[Maclear Scraper] Current URL: ${currentUrl}`);

    if (currentUrl.includes("/login") || currentUrl.includes("cloudflare")) {
      const pageText = await page.evaluate(`document.body.innerText.substring(0, 300)`);
      throw new Error(`Session cookies have expired or are invalid. Please refresh your cookies from the browser. Page: ${pageText}`);
    }

    const cfCheck = await page.evaluate(`(function() {
      var t = document.body ? document.body.innerText : "";
      return t.includes("Sorry, you have been blocked") || t.includes("Performing security verification") || t.includes("security service");
    })()`);
    if (cfCheck) {
      const snippet = await page.evaluate(`document.body ? document.body.innerText.substring(0, 300) : "no body"`);
      throw new Error(`Cloudflare is blocking the request. Make sure your cookies include cf_clearance and are fresh. Page: ${snippet}`);
    }

    console.log("[Maclear Scraper] Waiting for overview statistics...");
    await page.waitForSelector(".overview-statistics__value-number", { timeout: 20000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));

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

      throw new Error("Could not find 'Active investments' stat block on the overview page. The page layout may have changed.");
    })()`) as number;

    console.log(`[Maclear Scraper] Scraping complete. Active investments: €${totalBalance}`);

    return { totalBalance, scrapedAt: new Date() };

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
