export interface Trading212PieData {
  pieId: number;
  pieName: string;
  investedValue: number;
  currentValue: number;
  cash: number;
  result: number;
  resultPercent: number;
  dividendsGained: number;
  scrapedAt: Date;
}

export interface Trading212ScrapedData {
  pies: Trading212PieData[];
  scrapedAt: Date;
}

const BASE_URL = "https://live.trading212.com/api/v0";

async function makeRequest(path: string, apiKey: string, apiSecret: string): Promise<any> {
  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const url = `${BASE_URL}${path}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Trading 212 API error (${response.status}): ${text}`);
  }

  return response.json();
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
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`[Trading212] Fetching details for pie ${pie.id}...`);
    const detail = await makeRequest(`/equity/pies/${pie.id}`, apiKey, apiSecret) as {
      settings: { name: string; id: number };
    };

    pieDetails.push({
      pieId: pie.id,
      pieName: detail.settings.name,
      investedValue: pie.result.priceAvgInvestedValue,
      currentValue: pie.result.priceAvgValue + pie.cash,
      cash: pie.cash,
      result: pie.result.priceAvgResult,
      resultPercent: pie.result.priceAvgResultCoef * 100,
      dividendsGained: pie.dividendDetails.gained,
      scrapedAt: new Date(),
    });

    console.log(`[Trading212] Pie "${detail.settings.name}": invested=${pie.result.priceAvgInvestedValue}, value=${pie.result.priceAvgValue + pie.cash}`);
  }

  return {
    pies: pieDetails,
    scrapedAt: new Date(),
  };
}
