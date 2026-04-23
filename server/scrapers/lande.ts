import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { getChromiumPath } from "./chromium";
import { getProxyArgs, applyProxy } from "./proxy";

puppeteer.use(StealthPlugin());

export interface LandeScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const LOGIN_URL = "https://lande.finance/login";
const INVESTOR_URL = "https://lande.finance/investor";

export async function scrapeLande(email: string, password: string): Promise<LandeScrapedData> {
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

    console.log("[Lande Scraper] Navigating to login page...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("[Lande Scraper] Current URL:", page.url());

    const emailSelector = 'input[type="email"], input[name="email"], input[id="email"]';
    const passSelector = 'input[type="password"], input[name="password"], input[id="password"]';

    console.log("[Lande Scraper] Waiting for login form...");
    await page.waitForSelector(emailSelector, { timeout: 30000 }).catch(async () => {
      const html = await page.evaluate(`document.body ? document.body.innerHTML.slice(0, 1000) : "no body"`);
      throw new Error(`Login form not found. Page HTML: ${html}`);
    });

    console.log("[Lande Scraper] Filling credentials...");
    await page.$eval(emailSelector, (el: any) => el.value = "");
    await page.type(emailSelector, email, { delay: 50 });
    await page.$eval(passSelector, (el: any) => el.value = "");
    await page.type(passSelector, password, { delay: 50 });

    console.log("[Lande Scraper] Submitting login...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
      page.keyboard.press("Enter"),
    ]);
    await new Promise(resolve => setTimeout(resolve, 3000));

    const urlAfterLogin = page.url();
    console.log("[Lande Scraper] URL after login:", urlAfterLogin);

    if (urlAfterLogin.includes("/login")) {
      const errorText = await page.evaluate(`(function() {
        var el = document.querySelector('.alert, .error, [class*="error"], [class*="alert"]');
        return el ? el.textContent.trim() : null;
      })()`);
      throw new Error(`Login failed${errorText ? ": " + errorText : ". Please check your credentials."}`);
    }

    if (!urlAfterLogin.includes("/investor")) {
      console.log("[Lande Scraper] Navigating to investor page...");
      await page.goto(INVESTOR_URL, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log("[Lande Scraper] Waiting for balance element...");
    await page.waitForSelector("#total_balance", { timeout: 20000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));

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

    if (totalBalance === 0) {
      const dump = await page.evaluate(`(function() {
        return {
          url: window.location.href,
          ids: Array.from(document.querySelectorAll("[id]")).map(function(el) { return el.id; }).slice(0, 40),
          text: document.body ? document.body.innerText.slice(0, 800) : "",
          html: document.body ? document.body.innerHTML.slice(0, 3000) : ""
        };
      })()`);
      console.log("[Lande Scraper] Balance is 0 — diagnostic dump:", JSON.stringify(dump));
    }

    console.log(`[Lande Scraper] Scraping complete. Total balance: €${totalBalance}`);

    return { totalBalance, scrapedAt: new Date() };

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
