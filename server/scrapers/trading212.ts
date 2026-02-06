export interface Trading212Instrument {
  ticker: string;
  shares: number;
  expectedShare: number;
  currentShare: number;
  result: number;
  currentPrice?: number;
  averagePrice?: number;
  ppl?: number;
  fxPpl?: number;
  quantity?: number;
}

export interface Trading212PieData {
  pieId: number;
  pieName: string;
  investedValue: number;
  currentValue: number;
  cash: number;
  result: number;
  resultPercent: number;
  dividendsGained: number;
  dividendsReinvested: number;
  dividendsInCash: number;
  instruments: Trading212Instrument[];
  scrapedAt: Date;
}

export interface Trading212ScrapedData {
  pies: Trading212PieData[];
  scrapedAt: Date;
}

const BASE_URL = "https://live.trading212.com/api/v0";

async function makeRequest(path: string, apiKey: string, apiSecret: string, retries = 3): Promise<any> {
  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const url = `${BASE_URL}${path}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (response.status === 429) {
      if (attempt < retries) {
        const waitTime = attempt * 5000;
        console.log(`[Trading212] Rate limited, waiting ${waitTime / 1000}s before retry ${attempt + 1}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      const text = await response.text();
      throw new Error(`Trading 212 API rate limit exceeded after ${retries} attempts: ${text}`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Trading 212 API error (${response.status}): ${text}`);
    }

    return response.json();
  }
  throw new Error("Trading 212 API request failed: no response received");
}

interface PositionData {
  ticker: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  ppl: number;
  fxPpl: number;
  pieQuantity: number;
}

export async function fetchPositions(apiKey: string, apiSecret: string): Promise<Map<string, PositionData>> {
  console.log("[Trading212] Fetching all positions...");
  const positions = await makeRequest("/equity/portfolio", apiKey, apiSecret) as PositionData[];
  const posMap = new Map<string, PositionData>();
  for (const pos of positions) {
    posMap.set(pos.ticker, pos);
  }
  console.log(`[Trading212] Found ${positions.length} position(s)`);
  return posMap;
}

export async function scrapeTrading212(apiKey: string, apiSecret: string): Promise<Trading212ScrapedData> {
  console.log("[Trading212] Fetching pies list...");
  const pies = await makeRequest("/equity/pies", apiKey, apiSecret) as Array<{
    id: number;
    cash: number;
    dividendDetails: { gained: number; reinvested: number; inCash: number };
    result: {
      priceAvgInvestedValue: number;
      priceAvgValue: number;
      priceAvgResult: number;
      priceAvgResultCoef: number;
    };
  }>;

  console.log(`[Trading212] Found ${pies.length} pie(s)`);

  const pieDetails: Trading212PieData[] = [];

  for (let i = 0; i < pies.length; i++) {
    const pie = pies[i];

    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log(`[Trading212] Fetching details for pie ${pie.id}...`);
    const detail = await makeRequest(`/equity/pies/${pie.id}`, apiKey, apiSecret) as {
      settings: { name: string; id: number };
      instruments: Array<{
        ticker: string;
        shares: number;
        expectedShare: number;
        currentShare: number;
        result: number;
      }>;
    };

    const actualDeposited = pie.result.priceAvgInvestedValue - pie.dividendDetails.gained;

    pieDetails.push({
      pieId: pie.id,
      pieName: detail.settings.name,
      investedValue: actualDeposited,
      currentValue: pie.result.priceAvgValue + pie.cash,
      cash: pie.cash,
      result: pie.result.priceAvgResult,
      resultPercent: pie.result.priceAvgResultCoef * 100,
      dividendsGained: pie.dividendDetails.gained,
      dividendsReinvested: pie.dividendDetails.reinvested,
      dividendsInCash: pie.dividendDetails.inCash,
      instruments: detail.instruments || [],
      scrapedAt: new Date(),
    });

    console.log(`[Trading212] Pie "${detail.settings.name}": deposited=${actualDeposited.toFixed(2)} (raw invested=${pie.result.priceAvgInvestedValue}, dividends: gained=${pie.dividendDetails.gained}, reinvested=${pie.dividendDetails.reinvested}, inCash=${pie.dividendDetails.inCash}, cash in pie=${pie.cash}), value=${(pie.result.priceAvgValue + pie.cash).toFixed(2)}`);
  }

  return {
    pies: pieDetails,
    scrapedAt: new Date(),
  };
}

export async function scrapeTrading212WithPositions(apiKey: string, apiSecret: string): Promise<Trading212ScrapedData> {
  const data = await scrapeTrading212(apiKey, apiSecret);

  await new Promise(resolve => setTimeout(resolve, 5000));

  const posMap = await fetchPositions(apiKey, apiSecret);

  for (const pie of data.pies) {
    for (const inst of pie.instruments) {
      const pos = posMap.get(inst.ticker);
      if (pos) {
        inst.currentPrice = pos.currentPrice;
        inst.averagePrice = pos.averagePrice;
        inst.quantity = pos.pieQuantity || pos.quantity;
        inst.ppl = pos.ppl;
        inst.fxPpl = pos.fxPpl;
      }
    }
  }

  return data;
}
