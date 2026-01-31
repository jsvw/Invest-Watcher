import Imap from "imap";
import { simpleParser, ParsedMail } from "mailparser";
import { db } from "./db";
import { emailSettings, emailImports, platforms, assets, type EmailSettings, type Platform, type Asset } from "@shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface ParsedTransaction {
  transactionType: "deposit" | "withdrawal" | "purchase" | "partial_exit" | "full_exit" | "interest";
  platformName: string | null;
  assetName: string | null;
  amount: number | null;
  date: string | null;
  notes: string | null;
}

export async function parseEmailWithAI(
  subject: string,
  body: string,
  userPlatforms: Platform[],
  userAssets: Asset[]
): Promise<ParsedTransaction> {
  const platformNames = userPlatforms.map((p) => p.name).join(", ");
  const assetNames = userAssets.map((a) => `${a.name} (platform: ${userPlatforms.find(p => p.id === a.platformId)?.name || 'unknown'})`).join(", ");

  const prompt = `Analyze this investment-related email and extract transaction details.

EMAIL SUBJECT: ${subject}

EMAIL BODY:
${body.substring(0, 4000)}

USER'S EXISTING PLATFORMS: ${platformNames || "None yet"}
USER'S EXISTING ASSETS: ${assetNames || "None yet"}

Extract the following information in JSON format:
{
  "transactionType": "deposit" | "withdrawal" | "purchase" | "partial_exit" | "full_exit" | "interest",
  "platformName": "name of the investment platform mentioned",
  "assetName": "name of specific asset if mentioned (for purchases/exits)",
  "amount": number (the transaction amount, without currency symbols),
  "date": "YYYY-MM-DD format if mentioned",
  "notes": "brief summary of the transaction"
}

Transaction type definitions:
- deposit: Adding money to a platform
- withdrawal: Taking money out of a platform
- purchase: Buying a specific asset/investment item
- partial_exit: Selling part of an asset or receiving partial principal repayment
- full_exit: Complete sale/closure of an asset
- interest: Receiving interest, dividends, or returns

If the email doesn't appear to be investment-related, set all fields to null.
Try to match platformName to an existing platform if possible.
Try to match assetName to an existing asset if possible.

Return ONLY valid JSON, no other text.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ParsedTransaction;
    }
  } catch (error) {
    console.error("AI parsing error:", error);
  }

  return {
    transactionType: "deposit",
    platformName: null,
    assetName: null,
    amount: null,
    date: null,
    notes: null,
  };
}

function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 1;
  if (t.includes(q) || q.includes(t)) return 0.8;
  const words = q.split(/\s+/);
  const matchCount = words.filter((w) => t.includes(w)).length;
  return matchCount / words.length * 0.6;
}

function findBestPlatformMatch(name: string, platforms: Platform[]): Platform | null {
  if (!name) return null;
  let bestMatch: Platform | null = null;
  let bestScore = 0.3;
  for (const platform of platforms) {
    const score = fuzzyMatch(name, platform.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = platform;
    }
  }
  return bestMatch;
}

function findBestAssetMatch(name: string, assets: Asset[], platformId?: number): Asset | null {
  if (!name) return null;
  let bestMatch: Asset | null = null;
  let bestScore = 0.3;
  for (const asset of assets) {
    if (platformId && asset.platformId !== platformId) continue;
    const score = fuzzyMatch(name, asset.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = asset;
    }
  }
  return bestMatch;
}

export async function fetchEmailsForUser(userId: number): Promise<{ success: boolean; count: number; error?: string }> {
  const settings = await db
    .select()
    .from(emailSettings)
    .where(eq(emailSettings.userId, userId))
    .limit(1);

  if (!settings.length || !settings[0].enabled) {
    return { success: false, count: 0, error: "Email settings not configured or disabled" };
  }

  const config = settings[0];
  const userPlatforms = await db.select().from(platforms).where(eq(platforms.userId, userId));
  
  // Only fetch assets for the user's platforms to ensure data isolation
  const userPlatformIds = userPlatforms.map(p => p.id);
  const userAssets = userPlatformIds.length > 0 
    ? await db.select().from(assets).where(inArray(assets.platformId, userPlatformIds))
    : [];

  return new Promise((resolve) => {
    const imap = new Imap({
      user: config.imapUser,
      password: config.imapPassword,
      host: config.imapHost,
      port: config.imapPort,
      tls: config.imapTls,
      tlsOptions: { rejectUnauthorized: false },
    });

    let processedCount = 0;

    imap.once("ready", () => {
      imap.openBox("INBOX", false, async (err, box) => {
        if (err) {
          imap.end();
          resolve({ success: false, count: 0, error: `Failed to open inbox: ${err.message}` });
          return;
        }

        const lastPoll = config.lastPollAt || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const searchDate = lastPoll.toISOString().split("T")[0];

        imap.search([["SINCE", searchDate]], async (searchErr, results) => {
          if (searchErr || !results.length) {
            await db.update(emailSettings).set({ lastPollAt: new Date() }).where(eq(emailSettings.id, config.id));
            imap.end();
            resolve({ success: true, count: 0 });
            return;
          }

          const existingUids = await db
            .select({ emailUid: emailImports.emailUid })
            .from(emailImports)
            .where(eq(emailImports.userId, userId));
          const existingUidSet = new Set(existingUids.map((e) => e.emailUid));

          const fetch = imap.fetch(results, { bodies: "", struct: true });
          const emailPromises: Promise<void>[] = [];

          fetch.on("message", (msg, seqno) => {
            const uid = String(seqno);
            if (existingUidSet.has(uid)) return;

            let buffer = "";
            msg.on("body", (stream) => {
              stream.on("data", (chunk) => {
                buffer += chunk.toString("utf8");
              });
            });

            msg.once("end", () => {
              emailPromises.push(
                (async () => {
                  try {
                    const parsed: ParsedMail = await simpleParser(buffer);
                    const subject = parsed.subject || "";
                    const body = parsed.text || "";
                    const from = parsed.from?.text || "";
                    const date = parsed.date || new Date();

                    const aiResult = await parseEmailWithAI(subject, body, userPlatforms, userAssets);

                    const matchedPlatform = aiResult.platformName
                      ? findBestPlatformMatch(aiResult.platformName, userPlatforms)
                      : null;

                    const matchedAsset = aiResult.assetName
                      ? findBestAssetMatch(aiResult.assetName, userAssets, matchedPlatform?.id)
                      : null;

                    await db.insert(emailImports).values({
                      userId,
                      emailUid: uid,
                      emailSubject: subject.substring(0, 500),
                      emailFrom: from.substring(0, 200),
                      emailDate: date,
                      emailBody: body.substring(0, 10000),
                      transactionType: aiResult.transactionType,
                      parsedPlatformName: aiResult.platformName,
                      parsedAssetName: aiResult.assetName,
                      parsedAmount: aiResult.amount?.toString() || null,
                      parsedDate: aiResult.date ? new Date(aiResult.date) : null,
                      parsedNotes: aiResult.notes,
                      matchedPlatformId: matchedPlatform?.id || null,
                      matchedAssetId: matchedAsset?.id || null,
                      status: "pending",
                    });

                    processedCount++;
                  } catch (parseErr) {
                    console.error("Error parsing email:", parseErr);
                  }
                })()
              );
            });
          });

          fetch.once("error", (fetchErr) => {
            console.error("Fetch error:", fetchErr);
          });

          fetch.once("end", async () => {
            await Promise.all(emailPromises);
            await db.update(emailSettings).set({ lastPollAt: new Date() }).where(eq(emailSettings.id, config.id));
            imap.end();
            resolve({ success: true, count: processedCount });
          });
        });
      });
    });

    imap.once("error", (imapErr: Error) => {
      resolve({ success: false, count: 0, error: `IMAP connection error: ${imapErr.message}` });
    });

    imap.connect();
  });
}
