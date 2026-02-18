import puppeteer from "puppeteer-core";
import { ImapFlow } from "imapflow";
import { getChromiumPath } from "./chromium";

export interface SynVestScrapedData {
  totalBalance: number;
  totalInvested?: number;
  vaults?: any[];
  mainBalance?: number;
  scrapedAt: Date;
}

const LOGIN_URL = "https://mijn.synvest.nl/login";

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
  console.log(`[SynVest 2FA] Waiting ${waitBeforeStart / 1000}s before checking email for verification code...`);
  await new Promise(resolve => setTimeout(resolve, waitBeforeStart));

  const imapServer = getImapServer(email);
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
    await client.connect();
    const searchStart = new Date();
    searchStart.setMinutes(searchStart.getMinutes() - 5);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[SynVest 2FA] Checking inbox, attempt ${attempt}/${maxAttempts}...`);
      const lock = await client.getMailboxLock("INBOX");
      try {
        const searchResult = await client.search({
          since: searchStart,
          or: [
            { from: "synvest" },
            { subject: "code" },
            { subject: "verificatie" },
            { subject: "inloggen" },
            { subject: "synvest" },
          ],
        });

        const uids = Array.isArray(searchResult) ? searchResult : [];
        if (uids.length > 0) {
          const latestUid = uids[uids.length - 1];
          const msg = await client.fetchOne(latestUid, { source: true });
          if (msg && msg.source) {
            const rawEmail = msg.source.toString();
            const codePatterns = [
              /(\d{6})/,
              /code[:\s]\s*(\d{4,8})/i,
              /verificatiecode[:\s]\s*(\d{4,8})/i,
            ];

            for (const pattern of codePatterns) {
              const match = rawEmail.match(pattern);
              if (match) {
                console.log(`[SynVest 2FA] Found verification code: ${match[1]}`);
                return match[1];
              }
            }
          }
        }
      } finally {
        lock.release();
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error("Could not find SynVest verification code in email. Please check your Gmail app password and ensure SynVest emails are not filtered.");
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function scrapeSynVest(email: string, password: string, gmailAppPassword?: string, gmailEmail?: string): Promise<SynVestScrapedData> {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: getChromiumPath(),
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");
    
    console.log("[SynVest Scraper] Navigating to login page...");
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30000 });

    console.log("[SynVest Scraper] Filling login form...");
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
    await page.type('input[name="email"], input[type="email"]', email);
    await page.type('input[name="password"], input[type="password"]', password);

    console.log("[SynVest Scraper] Submitting login...");
    await page.click('button[type="submit"]');
    
    // Check if 2FA is needed
    await new Promise(resolve => setTimeout(resolve, 5000));
    const has2FA = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      const has2faText = text.includes('verification') || text.includes('verify') || 
                       text.includes('2fa') || text.includes('two-factor') ||
                       text.includes('login code') || text.includes('security code') ||
                       text.includes('confirm') || text.includes('one-time') ||
                       text.includes('verificatie') || text.includes('code');
      const hasCodeInput = !!document.querySelector('input[type="text"]:not([type="email"]), input[type="number"], input[inputmode="numeric"], input[maxlength="6"], input[maxlength="4"], input[name*="code"]');
      return has2faText || hasCodeInput;
    });

    if (has2FA) {
      console.log("[SynVest Scraper] 2FA detected, fetching code...");
      if (!gmailAppPassword) {
        throw new Error("2FA required but no Gmail app password provided. Please configure it in scraper settings.");
      }
      const code = await fetch2FACodeFromEmail(gmailEmail || email, gmailAppPassword);
      console.log(`[SynVest Scraper] Entering 2FA code: ${code}`);
      
      const codeInput = await page.$('input[name*="code"]') 
        || await page.$('input[type="text"]:not([type="email"])')
        || await page.$('input[type="number"]')
        || await page.$('input[inputmode="numeric"]');

      if (codeInput) {
        await codeInput.click({ clickCount: 3 });
        await codeInput.type(code, { delay: 50 });
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
      } else {
        throw new Error("Could not find 2FA code input field on SynVest page.");
      }
    }

    console.log("[SynVest Scraper] Waiting for authenticated content...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log("[SynVest Scraper] Extracting balance...");
    const totalBalance = await page.evaluate(() => {
      const extractNumber = (text: string | null) => {
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

      const balanceSelectors = ['.dashboard-value', '.total-value', '[class*="balance"]', 'h2', 'h1', '.amount'];
      for (const selector of balanceSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of Array.from(elements)) {
          const text = el.textContent || "";
          if (text.includes("€") || text.toLowerCase().includes("totaal") || text.toLowerCase().includes("waarde")) {
            const val = extractNumber(text);
            if (val && val > 0) return val;
          }
        }
      }
      return 0;
    });

    console.log(`[SynVest Scraper] Scraping complete. Total balance: €${totalBalance}`);
    return { 
      totalBalance, 
      scrapedAt: new Date(),
      totalInvested: 0,
      vaults: [],
      mainBalance: totalBalance
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
