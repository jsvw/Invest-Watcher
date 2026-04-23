import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { getChromiumPath } from "./chromium";
import { getProxyArgs, applyProxy } from "./proxy";

puppeteer.use(StealthPlugin());

export interface LandeScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const DASHBOARD_URL = "https://lande.finance/dashboard";

function parseCookieString(cookieStr: string): Array<{ name: string; value: string; domain: string; path: string }> {
  return cookieStr
    .split(";")
    .map(part => {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) return null;
      const name = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      if (!name) return null;
      return { name, value, domain: ".lande.finance", path: "/" };
    })
    .filter(Boolean) as Array<{ name: string; value: string; domain: string; path: string }>;
}

export async function scrapeLande(cookies: string): Promise<LandeScrapedData> {
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
        ...getProxyArgs(),
      ],
    });

    const page = await browser.newPage();
    await applyProxy(page);
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    // Inject the user's browser cookies so Cloudflare sees a trusted session
    const parsedCookies = parseCookieString(cookies);
    console.log(`[Lande Scraper] Injecting ${parsedCookies.length} cookies...`);
    if (parsedCookies.length === 0) {
      throw new Error("No valid cookies found. Please paste the full Cookie header value from your browser.");
    }
    await page.setCookie(...parsedCookies);

    console.log("[Lande Scraper] Navigating to dashboard...");
    await page.goto(DASHBOARD_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    console.log(`[Lande Scraper] Current URL: ${currentUrl}`);

    // If redirected back to login or Cloudflare challenge, the cookies have expired
    if (currentUrl.includes("/login") || currentUrl.includes("cloudflare")) {
      const pageText = await page.evaluate(`document.body.innerText.substring(0, 300)`);
      throw new Error(`Session cookies have expired or are invalid. Please refresh your cookies from the browser. Page: ${pageText}`);
    }

    // Check for Cloudflare challenge page
    const cfCheck = await page.evaluate(`(function() {
      var t = document.body ? document.body.innerText : "";
      return t.includes("Performing security verification") || t.includes("security service");
    })()`);
    if (cfCheck) {
      throw new Error("Cloudflare challenge still active. Make sure to include the cf_clearance cookie when copying from your browser.");
    }

    console.log("[Lande Scraper] Waiting for balance element...");
    await page.waitForSelector("#total_balance", { timeout: 20000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));

    const diag = await page.evaluate(`(function() {
      var url = window.location.href;
      var balEl = document.querySelector("#total_balance");
      var bodyHtml = document.body ? document.body.innerHTML.slice(0, 4000) : "no body";
      var allIds = Array.from(document.querySelectorAll("[id]")).map(function(el) { return el.id; }).slice(0, 50);
      var allText = document.body ? document.body.innerText.slice(0, 1000) : "";
      return { url: url, balanceText: balEl ? balEl.textContent.trim() : null, bodyHtml: bodyHtml, allIds: allIds, allText: allText };
    })()`) as { url: string; balanceText: string | null; bodyHtml: string; allIds: string[]; allText: string };
    console.log("[Lande Scraper] Page URL:", diag.url);
    console.log("[Lande Scraper] #total_balance text:", diag.balanceText);
    console.log("[Lande Scraper] All element IDs on page:", JSON.stringify(diag.allIds));
    console.log("[Lande Scraper] Page text (first 1000):", diag.allText);
    console.log("[Lande Scraper] Body HTML (first 4000):", diag.bodyHtml);

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

      var balEl = document.querySelector("#total_balance");
      if (balEl) {
        var val = extractNumber(balEl.textContent);
        if (val !== null && val >= 0) {
          console.log("[Lande Scraper] Found via #total_balance: " + val);
          return val;
        }
      }

      var labelCandidates = ["total balance", "total", "balance", "portfolio"];
      var findValueNearLabel = function(labelText) {
        var allElements = document.querySelectorAll("*");
        for (var i = 0; i < allElements.length; i++) {
          var el = allElements[i];
          if (el.children.length > 0) continue;
          var txt = (el.textContent || "").trim().toLowerCase();
          if (txt.indexOf(labelText.toLowerCase()) === -1) continue;
          if (txt.length > labelText.length * 3) continue;
          var next = el.nextElementSibling;
          if (next) { var nv = extractNumber(next.textContent); if (nv !== null) return nv; }
          var prev = el.previousElementSibling;
          if (prev) { var pv = extractNumber(prev.textContent); if (pv !== null) return pv; }
          if (el.parentElement) {
            var sibs = Array.from(el.parentElement.children);
            for (var s = 0; s < sibs.length; s++) {
              if (sibs[s] !== el) { var sv = extractNumber(sibs[s].textContent); if (sv !== null) return sv; }
            }
          }
        }
        return null;
      };

      for (var li = 0; li < labelCandidates.length; li++) {
        var lv = findValueNearLabel(labelCandidates[li]);
        if (lv !== null && lv > 0) {
          console.log("[Lande Scraper] Found via label '" + labelCandidates[li] + "': " + lv);
          return lv;
        }
      }

      return 0;
    })()`) as number;

    console.log(`[Lande Scraper] Scraping complete. Total balance: €${totalBalance}`);

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
