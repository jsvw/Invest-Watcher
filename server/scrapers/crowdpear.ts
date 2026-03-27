import puppeteer from "puppeteer-core";
import { ImapFlow } from "imapflow";
import { getChromiumPath } from "./chromium";

export interface CrowdPearScrapedData {
  totalBalance: number;
  scrapedAt: Date;
}
const LOGIN_URL = "https://crowdpear.com/en/client";

function getImapServer(email: string): { host: string; port: number } {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  const outlookDomains = ["outlook.com", "hotmail.com", "live.com", "live.nl", "live.co.uk", "live.fr", "live.de", "live.it", "live.be", "msn.com", "passport.com", "outlook.co.uk", "outlook.de", "outlook.fr", "outlook.it", "outlook.nl", "outlook.be"];
  const yahooDomains = ["yahoo.com", "yahoo.co.uk", "yahoo.fr", "yahoo.de", "ymail.com", "rocketmail.com"];

  if (outlookDomains.includes(domain) || domain.endsWith(".outlook.com") || domain.startsWith("live.")) {
    return { host: "outlook.office365.com", port: 993 };
  } else if (yahooDomains.includes(domain)) {
    return { host: "imap.mail.yahoo.com", port: 993 };
  }
  return { host: "imap.gmail.com", port: 993 };
}

async function fetch2FACodeFromEmail(email: string, appPassword: string, maxAttempts = 12, waitBeforeStart = 10000): Promise<string> {
  console.log(`[CrowdPear 2FA] Waiting ${waitBeforeStart / 1000}s before checking email for verification code...`);
  await new Promise(resolve => setTimeout(resolve, waitBeforeStart));

  const imapServer = getImapServer(email);
  console.log(`[CrowdPear 2FA] Connecting to ${imapServer.host} IMAP to fetch verification code...`);
  const client = new ImapFlow({
    host: imapServer.host,
    port: imapServer.port,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  });

  try {
    try {
      await client.connect();
    } catch (err: any) {
      if (err.authenticationFailed) {
        throw new Error(`Gmail login failed for ${email}. Please check: 1) IMAP is enabled in Gmail settings, 2) 2-Step Verification is turned on, 3) App password is correct (16 characters, no spaces). Generate a new one at myaccount.google.com > Security > App passwords.`);
      }
      throw err;
    }
    const searchStart = new Date();
    searchStart.setMinutes(searchStart.getMinutes() - 3);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[CrowdPear 2FA] Checking inbox, attempt ${attempt}/${maxAttempts}...`);

      const lock = await client.getMailboxLock("INBOX");
      try {
        const searchResult = await client.search({
          since: searchStart,
          or: [
            { from: "crowdpear" },
            { from: "noreply" },
            { subject: "verification" },
            { subject: "login code" },
            { subject: "security code" },
            { subject: "crowdpear" },
            { subject: "login attempt" },
          ],
        });

        const uids = Array.isArray(searchResult) ? searchResult : [];

        if (uids.length > 0) {
          const latestUid = uids[uids.length - 1];
          const msg = await client.fetchOne(latestUid, { source: true, uid: true });
          if (msg && msg.source) {
            const rawEmail = msg.source.toString();
            const lowerEmail = rawEmail.toLowerCase();

            if (!lowerEmail.includes("crowdpear") && !lowerEmail.includes("verification") && !lowerEmail.includes("login code") && !lowerEmail.includes("login attempt")) {
              console.log("[CrowdPear 2FA] Email found but doesn't appear to be from CrowdPear, skipping...");
            } else {
              const codePatterns = [
                /(?:verification|login|confirm|security|auth)\s*(?:code|pin|number)\s*[:\s]\s*(\d{4,8})/i,
                /(?:your\s+)?(?:code|pin)\s*(?:is)?[:\s]\s*(\d{4,8})/i,
                />\s*(\d{6})\s*</,
                /(?:^|\s)(\d{6})(?:\s|$)/m,
              ];

              for (const pattern of codePatterns) {
                const match = rawEmail.match(pattern);
                if (match) {
                  console.log(`[CrowdPear 2FA] Found verification code: ${match[1]}`);
                  return match[1];
                }
              }

              const standaloneCodePattern = /(?:^|[\s>])(\d{4,6})(?:[\s<]|$)/gm;
              let codeMatch;
              const potentialCodes: string[] = [];
              while ((codeMatch = standaloneCodePattern.exec(rawEmail)) !== null) {
                const code = codeMatch[1].trim();
                if (code.length >= 4 && code.length <= 6 && !/^(19|20)\d{2}$/.test(code)) {
                  potentialCodes.push(code);
                }
              }

              if (potentialCodes.length > 0) {
                const sixDigit = potentialCodes.find(c => c.length === 6);
                const fourDigit = potentialCodes.find(c => c.length === 4);
                const chosen = sixDigit || fourDigit || potentialCodes[0];
                console.log(`[CrowdPear 2FA] Found potential code: ${chosen} (from ${potentialCodes.length} candidates)`);
                return chosen;
              }

              console.log("[CrowdPear 2FA] CrowdPear email found but could not extract code, will retry...");
            }
          }
        }
      } finally {
        lock.release();
      }

      if (attempt < maxAttempts) {
        const waitTime = attempt <= 3 ? 5000 : 3000;
        console.log(`[CrowdPear 2FA] Code not found yet, waiting ${waitTime / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw new Error("Could not find CrowdPear verification code in email after multiple attempts. Please check your Gmail app password and ensure CrowdPear emails are not filtered.");
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function scrapeCrowdPear(email: string, password: string, gmailAppPassword?: string, gmailEmail?: string): Promise<CrowdPearScrapedData> {
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
    await new Promise(resolve => setTimeout(resolve, 3000));

    const pageTextAfterLogin = await page.evaluate(`document.body.innerText.substring(0, 1000)`) as string;
    console.log(`[CrowdPear Scraper] Page text after login: ${pageTextAfterLogin.substring(0, 300)}`);

    const has2FA = await page.evaluate(`(function() {
      var text = document.body.innerText.toLowerCase();
      var has2faText = text.includes('verification') || text.includes('verify') || 
                       text.includes('2fa') || text.includes('two-factor') ||
                       text.includes('login code') || text.includes('security code') ||
                       text.includes('confirm') || text.includes('one-time');
      var hasCodeInput = document.querySelector('input[type="text"]:not([type="email"]), input[type="number"], input[inputmode="numeric"], input[maxlength="6"], input[maxlength="4"]');
      var hasMultipleCodeInputs = document.querySelectorAll('input[maxlength="1"]').length >= 4;
      return has2faText || !!hasCodeInput || hasMultipleCodeInputs;
    })()`) as boolean;

    if (has2FA) {
      console.log("[CrowdPear Scraper] 2FA verification detected!");

      if (!gmailAppPassword) {
        throw new Error("2FA verification required but no Gmail app password configured. Please add your Gmail app password in the scraper settings.");
      }

      const imapEmail = gmailEmail || email;
      const code = await fetch2FACodeFromEmail(imapEmail, gmailAppPassword);

      const multiInputs = await page.$$('input[maxlength="1"]');
      if (multiInputs.length >= 4) {
        for (let i = 0; i < Math.min(code.length, multiInputs.length); i++) {
          await multiInputs[i].click();
          await multiInputs[i].type(code[i], { delay: 30 });
        }
      } else {
        const codeInput = await page.$('input[type="text"]:not([type="email"])')
          || await page.$('input[type="number"]')
          || await page.$('input[inputmode="numeric"]')
          || await page.$('input[maxlength="6"]')
          || await page.$('input[maxlength="4"]');

        if (codeInput) {
          await codeInput.click({ clickCount: 3 });
          await codeInput.type(code, { delay: 50 });
        } else {
          throw new Error("Could not find 2FA code input field on the page");
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const submitResult = await page.evaluate(`(function() {
        var buttons = Array.from(document.querySelectorAll('button[type="submit"], button'));
        for (var i = 0; i < buttons.length; i++) {
          var t = buttons[i].textContent ? buttons[i].textContent.trim().toLowerCase() : "";
          if (t.includes('verify') || t.includes('confirm') || t.includes('submit') || t.includes('continue') || t.includes('sign in') || t.includes('log in')) {
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

      if (!submitResult) {
        await page.keyboard.press("Enter");
      }

      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {
        console.log("[CrowdPear Scraper] Navigation after 2FA not fired (SPA), continuing...");
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log("[CrowdPear Scraper] 2FA code submitted, checking for authenticated content...");
    }

    console.log("[CrowdPear Scraper] Waiting for authenticated content to appear...");
    let authenticated = false;
    try {
      await page.waitForFunction(`(function() {
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
    console.log(`[CrowdPear Scraper] Current URL: ${currentUrl}`);

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

      // Helper: find a labelled value — handles value-before-label and value-after-label layouts.
      var findLabelledValue = function(labelPatterns) {
        var allEls = Array.from(document.querySelectorAll('*'));
        for (var i = 0; i < allEls.length; i++) {
          var el = allEls[i];
          // Only look at leaf-ish elements (few children) to avoid matching giant containers
          if (el.children.length > 5) continue;
          var elText = (el.textContent || '').trim().toLowerCase();
          var matched = false;
          for (var p = 0; p < labelPatterns.length; p++) {
            if (elText.includes(labelPatterns[p])) { matched = true; break; }
          }
          if (!matched) continue;

          // 1. Try previous sibling (value appears before the label element)
          var prev = el.previousElementSibling;
          if (prev) {
            var pv = extractNumber(prev.textContent);
            if (pv !== null) return pv;
          }
          // 2. Try next sibling (value appears after the label element)
          var next = el.nextElementSibling;
          if (next) {
            var nv = extractNumber(next.textContent);
            if (nv !== null) return nv;
          }
          // 3. Try parent siblings and parent's own numeric children
          if (el.parentElement) {
            var parentPrev = el.parentElement.previousElementSibling;
            if (parentPrev) {
              var ppv = extractNumber(parentPrev.textContent);
              if (ppv !== null) return ppv;
            }
            var parentNext = el.parentElement.nextElementSibling;
            if (parentNext) {
              var pnv = extractNumber(parentNext.textContent);
              if (pnv !== null) return pnv;
            }
            var siblings = Array.from(el.parentElement.children);
            for (var s = 0; s < siblings.length; s++) {
              if (siblings[s] !== el) {
                var sv = extractNumber(siblings[s].textContent);
                if (sv !== null) return sv;
              }
            }
          }
        }
        return null;
      };

      // 1. Find the main invested/portfolio balance
      var mainBalance = null;
      var balanceEl = document.querySelector('.Balance_balance__-D0Zw');
      if (balanceEl) {
        mainBalance = extractNumber(balanceEl.textContent);
      }
      if (mainBalance === null) {
        var balanceEls = document.querySelectorAll('[class*="Balance_balance"]');
        for (var i = 0; i < balanceEls.length; i++) {
          var n = extractNumber(balanceEls[i].textContent);
          if (n !== null && n > 0) { mainBalance = n; break; }
        }
      }
      if (mainBalance === null) {
        mainBalance = findLabelledValue(['total balance', 'portfolio value', 'invested', 'my investments']);
      }
      if (mainBalance === null) {
        var antTypoEls = document.querySelectorAll('.ant-typography');
        var candidates = [];
        for (var j = 0; j < antTypoEls.length; j++) {
          var txt = antTypoEls[j].textContent || "";
          if (txt.match(/[\\d.,]+/) && (txt.includes("\\u20ac") || txt.includes("EUR"))) {
            var amount = extractNumber(txt);
            if (amount !== null && amount > 0) candidates.push(amount);
          }
        }
        if (candidates.length > 0) {
          candidates.sort(function(a, b) { return b - a; });
          mainBalance = candidates[0];
        }
      }
      if (mainBalance === null) mainBalance = 0;

      // 2. Find "Available for investment" cash balance
      var availableBalance = findLabelledValue([
        'available for investment',
        'available to invest',
        'available funds',
        'cash available',
        'available balance',
      ]);

      // Fallback: regex on full page text — handles "€12.76\nAvailable for investment" layout
      if (availableBalance === null) {
        var pageText = document.body.innerText || '';
        var availPatterns = [
          /([\\d.,]+)\\s*€?\\s*\\n?\\s*Available\\s+for\\s+investment/i,
          /€\\s*([\\d.,]+)\\s*\\n?\\s*Available\\s+for\\s+investment/i,
          /Available\\s+for\\s+investment[\\s\\S]{0,30}€?\\s*([\\d.,]+)/i,
        ];
        for (var ap = 0; ap < availPatterns.length; ap++) {
          var am = pageText.match(availPatterns[ap]);
          if (am) {
            var av = extractNumber(am[1]);
            if (av !== null) { availableBalance = av; break; }
          }
        }
      }

      if (availableBalance === null) availableBalance = 0;

      console.log('[CrowdPear] mainBalance=' + mainBalance + ' availableBalance=' + availableBalance);
      return mainBalance + availableBalance;
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
