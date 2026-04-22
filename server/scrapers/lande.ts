import puppeteer from "puppeteer-core";
import { getChromiumPath } from "./chromium";

export interface LandeScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}

const LOGIN_URL = "https://lande.finance/login";

export async function scrapeLande(email: string, password: string): Promise<LandeScrapedData> {
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

    console.log("[Lande Scraper] Navigating to login page...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("[Lande Scraper] Dismissing cookie consent if present...");
    try {
      await page.evaluate(`(function() {
        var specific = document.querySelector("#onetrust-accept-btn-handler, .onetrust-accept-btn-handler, [id*='accept-btn-handler']");
        if (specific) { specific.click(); return; }
        var btns = Array.from(document.querySelectorAll("button, a"));
        for (var i = 0; i < btns.length; i++) {
          var t = (btns[i].textContent || "").toLowerCase().trim();
          if (t === "accept all" || t === "allow all" || t === "accept" || t === "agree" || t === "ok") {
            btns[i].click();
            return;
          }
        }
      })()`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch {
      console.log("[Lande Scraper] Cookie banner handling skipped");
    }

    console.log("[Lande Scraper] Waiting for login form...");
    await page.waitForSelector("#inp-email", { timeout: 15000 }).catch(() => {});

    const availableInputs = await page.evaluate(`(function() {
      return Array.from(document.querySelectorAll('input')).map(function(i) {
        return { name: i.name, type: i.type, id: i.id, placeholder: i.placeholder };
      });
    })()`) as Array<{ name: string; type: string; id: string; placeholder: string }>;
    console.log("[Lande Scraper] Available inputs:", JSON.stringify(availableInputs));

    const emailInput = await page.$("#inp-email");
    const passwordInput = await page.$("#password");

    if (!emailInput || !passwordInput) {
      throw new Error(`Could not find login fields. Available inputs: ${JSON.stringify(availableInputs)}`);
    }

    console.log("[Lande Scraper] Filling login form...");
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 50 });
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    console.log("[Lande Scraper] Submitting login...");
    await page.keyboard.press("Enter");

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    console.log(`[Lande Scraper] Current URL after login: ${currentUrl}`);

    if (currentUrl.includes("login")) {
      const errorText = await page.evaluate(`(function() {
        var errorEl = document.querySelector('.error, .alert-danger, .alert, [class*="error"], [class*="alert"]');
        return errorEl ? errorEl.textContent.trim() : null;
      })()`) as string | null;
      throw new Error(`Login failed${errorText ? `: ${errorText}` : ". Check your credentials."}`);
    }

    console.log("[Lande Scraper] Waiting for balance element...");
    await page.waitForSelector("#total_balance", { timeout: 15000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));

    const diag = await page.evaluate(`(function() {
      var url = window.location.href;
      var bodyText = (document.body.innerText || "").substring(0, 1000);
      var balEl = document.querySelector("#total_balance");
      return { url: url, bodyText: bodyText, balanceText: balEl ? balEl.textContent.trim() : null };
    })()`) as { url: string; bodyText: string; balanceText: string | null };
    console.log("[Lande Scraper] Page URL:", diag.url);
    console.log("[Lande Scraper] #total_balance text:", diag.balanceText);

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
