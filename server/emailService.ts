import Imap from "imap";
import { simpleParser, ParsedMail, Attachment } from "mailparser";
import { db } from "./db";
import { emailSettings, emailImports, platforms, assets, type EmailSettings, type Platform, type Asset } from "@shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import OpenAI from "openai";
// Lazy load pdf-parse
let pdfParseModule: ((dataBuffer: Buffer) => Promise<{ text: string }>) | null = null;

async function getPdfParse(): Promise<(dataBuffer: Buffer) => Promise<{ text: string }>> {
  if (!pdfParseModule) {
    // pdf-parse exports differently in ESM context
    const module = await import("pdf-parse") as any;
    pdfParseModule = module.default || module;
  }
  return pdfParseModule!;
}

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

async function extractTextFromAttachments(attachments: Attachment[]): Promise<string> {
  const textParts: string[] = [];
  
  console.log(`Processing ${attachments.length} attachment(s)`);
  
  for (const attachment of attachments) {
    try {
      const contentType = attachment.contentType?.toLowerCase() || "";
      const filename = attachment.filename?.toLowerCase() || "";
      
      console.log(`Attachment: ${attachment.filename}, type: ${contentType}, size: ${attachment.content?.length || 0} bytes`);
      
      // Handle PDF attachments
      if (contentType.includes("pdf") || filename.endsWith(".pdf")) {
        if (attachment.content) {
          const pdfParse = await getPdfParse();
          const pdfData = await pdfParse(attachment.content);
          console.log(`PDF parsed, text length: ${pdfData.text?.length || 0}`);
          if (pdfData.text) {
            textParts.push(`[PDF: ${attachment.filename}]\n${pdfData.text.substring(0, 5000)}`);
          }
        }
      }
      // Handle text/plain attachments
      else if (contentType.includes("text/plain") || filename.endsWith(".txt")) {
        if (attachment.content) {
          textParts.push(`[Text: ${attachment.filename}]\n${attachment.content.toString("utf8").substring(0, 5000)}`);
        }
      }
      // Handle CSV files
      else if (contentType.includes("csv") || filename.endsWith(".csv")) {
        if (attachment.content) {
          textParts.push(`[CSV: ${attachment.filename}]\n${attachment.content.toString("utf8").substring(0, 5000)}`);
        }
      }
      // Handle HTML attachments (sometimes transaction confirmations are HTML)
      else if (contentType.includes("html") || filename.endsWith(".html")) {
        if (attachment.content) {
          // Strip HTML tags for plain text
          const htmlText = attachment.content.toString("utf8")
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          textParts.push(`[HTML: ${attachment.filename}]\n${htmlText.substring(0, 5000)}`);
        }
      }
    } catch (err) {
      console.error(`Error parsing attachment ${attachment.filename}:`, err);
    }
  }
  
  return textParts.join("\n\n");
}

export async function parseEmailWithAI(
  subject: string,
  body: string,
  userPlatforms: Platform[],
  userAssets: Asset[],
  attachmentText: string = ""
): Promise<ParsedTransaction> {
  const platformNames = userPlatforms.map((p) => p.name).join(", ");
  
  // Include asset details with quantity for exit type determination
  const assetDetails = userAssets
    .filter(a => a.status === "active")
    .map((a) => {
      const platform = userPlatforms.find(p => p.id === a.platformId);
      const qty = a.quantity ? `qty: ${a.quantity}` : "";
      const invested = a.investedAmount ? `invested: ${a.investedAmount}` : "";
      return `${a.name} (platform: ${platform?.name || 'unknown'}, ${qty}, ${invested})`.replace(/, ,/g, ",").replace(/,\s*\)/g, ")");
    }).join("; ");

  const attachmentSection = attachmentText 
    ? `\n\nEMAIL ATTACHMENTS:\n${attachmentText.substring(0, 6000)}`
    : "";

  const prompt = `Analyze this investment-related email and extract transaction details.

EMAIL SUBJECT: ${subject}

EMAIL BODY:
${body.substring(0, 4000)}${attachmentSection}

USER'S EXISTING PLATFORMS: ${platformNames || "None yet"}
USER'S EXISTING ASSETS (active only): ${assetDetails || "None yet"}

Extract the following information in JSON format:
{
  "transactionType": "deposit" | "withdrawal" | "purchase" | "partial_exit" | "full_exit" | "interest",
  "platformName": "name of the investment platform mentioned",
  "assetName": "name of specific asset if mentioned (for purchases/exits)",
  "amount": number (the transaction amount, without currency symbols),
  "date": "YYYY-MM-DD format if mentioned",
  "notes": "brief summary of the transaction"
}

IMPORTANT - Amount extraction:
Look for these common fields in attachments and emails:
- "Total Price", "Total Amount", "Total", "Totaal"
- "Investment Amount", "Purchase Price", "Transaction Value"
- "Amount Paid", "Amount Invested", "Value"
- "Bedrag", "Inleg", "Aankoopprijs" (Dutch terms)
Extract the TOTAL amount as the transaction amount, not individual unit prices.

Transaction type definitions:
- deposit: Adding money to a platform
- withdrawal: Taking money out of a platform
- purchase: Buying a specific asset/investment item
- partial_exit: Selling PART of an asset (less than total quantity held)
- full_exit: Complete sale/closure of an asset (ALL quantity sold)
- interest: Receiving interest, dividends, or returns

EXIT TYPE DETERMINATION (CRITICAL - compare amounts carefully):
When an email mentions selling/exiting/repaying an asset, compare the amount to the user's holdings:
- PARTIAL EXIT: Amount repaid/sold is LESS than the user's total invested amount for that asset
- FULL EXIT: Amount repaid/sold EQUALS or EXCEEDS the user's total invested amount, OR email explicitly says "all", "complete", "full", "entire"
- For loans/real estate: "repaid" with a specific amount that is LESS than invested → partial_exit (it's a partial principal repayment)
- Example: If user has €317.98 invested and €17.65 is repaid → partial_exit (not full_exit!)
- Only use full_exit when the ENTIRE position is closed

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
      authTimeout: 30000,
      connTimeout: 30000,
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
                    
                    // Extract text from attachments (PDFs, CSVs, text files)
                    const attachmentText = parsed.attachments && parsed.attachments.length > 0
                      ? await extractTextFromAttachments(parsed.attachments)
                      : "";

                    const aiResult = await parseEmailWithAI(subject, body, userPlatforms, userAssets, attachmentText);

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
                      attachmentContent: attachmentText ? attachmentText.substring(0, 10000) : null,
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
