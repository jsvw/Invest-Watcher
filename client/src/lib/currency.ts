const CURRENCY_CONFIG: Record<string, { symbol: string; locale: string }> = {
  EUR: { symbol: "€", locale: "de-DE" },
  USD: { symbol: "$", locale: "en-US" },
  GBP: { symbol: "£", locale: "en-GB" },
  CHF: { symbol: "CHF", locale: "de-CH" },
  JPY: { symbol: "¥", locale: "ja-JP" },
  CAD: { symbol: "C$", locale: "en-CA" },
  AUD: { symbol: "A$", locale: "en-AU" },
  CNY: { symbol: "¥", locale: "zh-CN" },
  INR: { symbol: "₹", locale: "en-IN" },
  BRL: { symbol: "R$", locale: "pt-BR" },
};

export function formatCurrency(
  value: number | string | null | undefined,
  currencyCode: string = "EUR"
): string {
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  
  if (numValue == null || isNaN(numValue)) {
    return getCurrencySymbol(currencyCode) + "0";
  }

  const config = CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.EUR;
  
  try {
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numValue);
  } catch {
    return `${config.symbol}${numValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
}

export function getCurrencySymbol(currencyCode: string = "EUR"): string {
  return CURRENCY_CONFIG[currencyCode]?.symbol || currencyCode;
}

export function formatCompactCurrency(
  value: number | string | null | undefined,
  currencyCode: string = "EUR"
): string {
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  
  if (numValue == null || isNaN(numValue)) {
    return getCurrencySymbol(currencyCode) + "0";
  }

  const config = CURRENCY_CONFIG[currencyCode] || CURRENCY_CONFIG.EUR;
  
  try {
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: currencyCode,
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(numValue);
  } catch {
    return `${config.symbol}${numValue.toLocaleString(undefined, { notation: "compact" } as any)}`;
  }
}
