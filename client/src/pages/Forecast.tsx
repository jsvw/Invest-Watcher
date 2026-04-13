import { Layout } from "@/components/Layout";
import { useAuth } from "@/App";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/currency";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, type TooltipProps,
} from "recharts";
import { type ValueType, type NameType } from "recharts/types/component/DefaultTooltipContent";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Percent, Info, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ForecastMonth {
  label: string;
  totalValue: number;
  income: number;
}

interface ForecastPlatform {
  platformId: number;
  name: string;
  category: string;
  endValue: number;
  totalIncome: number;
  method: string;
  expectedGrowthPct: number | null;
}

interface ForecastResponse {
  months: ForecastMonth[];
  platforms: ForecastPlatform[];
  currentTotalValue: number;
}

function methodBadgeClass(method: string): string {
  if (method === "Rate Not Set") {
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  }
  if (method === "Asset Yields") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  }
  if (method.startsWith("Held Flat")) {
    return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
  return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
}

function StatCard({
  label,
  value,
  sub,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  highlight?: "positive" | "neutral";
}) {
  return (
    <Card data-testid={`forecast-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn(
              "text-2xl font-bold mt-1",
              highlight === "positive"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-foreground"
            )}>
              {value}
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted/50">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ForecastTooltip({
  active,
  payload,
  label,
  currency,
}: TooltipProps<ValueType, NameType> & { currency: string }) {
  if (!active || !payload?.length) return null;
  const totalValue = (payload.find(p => p.dataKey === "totalValue")?.value ?? 0) as number;
  const income = (payload.find(p => p.dataKey === "income")?.value ?? 0) as number;
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs min-w-[180px]">
      <p className="font-semibold mb-1">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Projected Value</span>
          <span className="font-medium">{formatCurrency(totalValue, currency)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Monthly Income</span>
          <span className="font-medium text-emerald-600">{formatCurrency(income, currency)}</span>
        </div>
      </div>
    </div>
  );
}

export default function Forecast() {
  const { user } = useAuth();
  const currency = user?.currency ?? "EUR";
  const queryClient = useQueryClient();

  const [editingPlatformId, setEditingPlatformId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<ForecastResponse>({
    queryKey: ["/api/forecast"],
  });

  const growthMutation = useMutation({
    mutationFn: ({ platformId, pct }: { platformId: number; pct: number | null }) =>
      apiRequest("PATCH", `/api/platforms/${platformId}/growth-pct`, { pct }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forecast"] });
    },
  });

  const projectedYearEndValue = data?.months[11]?.totalValue ?? 0;
  const projectedIncome = data?.months.reduce((sum, m) => sum + m.income, 0) ?? 0;
  const currentTotalValue = data?.currentTotalValue ?? 0;
  const projectedRoi = currentTotalValue > 0
    ? ((projectedYearEndValue - currentTotalValue) / currentTotalValue) * 100
    : 0;

  const chartData = data?.months ?? [];

  function startEdit(platform: ForecastPlatform) {
    setEditValue(platform.expectedGrowthPct !== null ? String(platform.expectedGrowthPct) : "");
    setEditingPlatformId(platform.platformId);
  }

  async function commitEdit(platformId: number) {
    const parsed = parseFloat(editValue);
    if (isNaN(parsed)) {
      setEditingPlatformId(null);
      setEditValue("");
      return;
    }
    setEditingPlatformId(null);
    setEditValue("");
    setSavingId(platformId);
    try {
      await growthMutation.mutateAsync({ platformId, pct: parsed });
    } finally {
      setSavingId(null);
    }
  }

  async function clearGrowthRate(platformId: number) {
    setSavingId(platformId);
    try {
      await growthMutation.mutateAsync({ platformId, pct: null });
    } finally {
      setSavingId(null);
    }
  }

  function cancelEdit() {
    setEditingPlatformId(null);
    setEditValue("");
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-display" data-testid="heading-forecast">
            12-Month Forecast
          </h1>
          <p className="text-muted-foreground mt-1">
            Projected portfolio performance over the next 12 months
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isLoading ? (
            <>
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </>
          ) : (
            <>
              <StatCard
                label="Projected Year-End Value"
                value={formatCurrency(projectedYearEndValue, currency)}
                sub={currentTotalValue > 0 ? `from ${formatCurrency(currentTotalValue, currency)} today` : undefined}
                icon={<TrendingUp className="h-4 w-4 text-primary" />}
              />
              <StatCard
                label="Projected Income (12 months)"
                value={formatCurrency(projectedIncome, currency)}
                sub="From yield-bearing assets"
                icon={<DollarSign className="h-4 w-4 text-primary" />}
                highlight="positive"
              />
              <StatCard
                label="Projected ROI"
                value={`${projectedRoi >= 0 ? "+" : ""}${projectedRoi.toFixed(2)}%`}
                sub="vs. current portfolio value"
                icon={<Percent className="h-4 w-4 text-primary" />}
                highlight={projectedRoi >= 0 ? "positive" : undefined}
              />
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Portfolio Value Projection</CardTitle>
            <CardDescription>Month-by-month projected total value across all platforms</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
                No forecast data available. Add platforms with valuations or assets to get started.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    data-testid="chart-xaxis-forecast"
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatCurrency(v, currency)}
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    width={90}
                  />
                  <RechartsTooltip content={<ForecastTooltip currency={currency} />} />
                  <Area
                    type="monotone"
                    dataKey="totalValue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#forecastGradient)"
                    name="Projected Value"
                    dot={false}
                    data-testid="chart-area-total-value"
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    fill="url(#incomeGradient)"
                    name="Monthly Income"
                    dot={false}
                    data-testid="chart-area-income"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform Breakdown</CardTitle>
            <CardDescription>
              Set an expected annual growth % for each standard platform to drive the forecast
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !data?.platforms.length ? (
              <p className="text-sm text-muted-foreground">No platforms found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-3 pr-4 font-medium" data-testid="th-platform">Platform</th>
                      <th className="text-left py-3 pr-4 font-medium" data-testid="th-category">Category</th>
                      <th className="text-right py-3 pr-4 font-medium" data-testid="th-end-value">Projected Year-End</th>
                      <th className="text-right py-3 pr-4 font-medium" data-testid="th-income">Projected Income</th>
                      <th className="text-left py-3 font-medium" data-testid="th-method">Growth Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.platforms]
                      .sort((a, b) => b.endValue - a.endValue)
                      .map((platform) => {
                        const isEditing = editingPlatformId === platform.platformId;
                        const isSaving = savingId === platform.platformId;
                        const isStandard = platform.method !== "Asset Yields" && !platform.method.startsWith("Held Flat");

                        return (
                          <tr
                            key={platform.platformId}
                            className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                            data-testid={`forecast-row-${platform.platformId}`}
                          >
                            <td className="py-3 pr-4 font-medium" data-testid={`forecast-name-${platform.platformId}`}>
                              {platform.name}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground" data-testid={`forecast-category-${platform.platformId}`}>
                              {platform.category}
                            </td>
                            <td className="py-3 pr-4 text-right font-medium" data-testid={`forecast-end-value-${platform.platformId}`}>
                              {formatCurrency(platform.endValue, currency)}
                            </td>
                            <td className="py-3 pr-4 text-right" data-testid={`forecast-income-${platform.platformId}`}>
                              {platform.totalIncome > 0 ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                  {formatCurrency(platform.totalIncome, currency)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3" data-testid={`forecast-method-${platform.platformId}`}>
                              {isStandard ? (
                                isEditing ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      step="0.1"
                                      placeholder="e.g. 8"
                                      value={editValue}
                                      onChange={e => setEditValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") commitEdit(platform.platformId);
                                        if (e.key === "Escape") cancelEdit();
                                      }}
                                      autoFocus
                                      className="w-20 h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                      data-testid={`forecast-growth-input-${platform.platformId}`}
                                    />
                                    <span className="text-xs text-muted-foreground">%/yr</span>
                                    <button
                                      onClick={() => commitEdit(platform.platformId)}
                                      className="h-6 w-6 rounded flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                      data-testid={`forecast-growth-confirm-${platform.platformId}`}
                                      aria-label="Save growth rate"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted/60 transition-colors"
                                      data-testid={`forecast-growth-cancel-${platform.platformId}`}
                                      aria-label="Cancel"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    {isSaving ? (
                                      <span className="text-xs text-muted-foreground animate-pulse">Saving…</span>
                                    ) : (
                                      <span
                                        className={cn(
                                          "text-xs px-2 py-0.5 rounded-full font-medium",
                                          methodBadgeClass(platform.method)
                                        )}
                                        data-testid={`forecast-badge-${platform.platformId}`}
                                      >
                                        {platform.method}
                                      </span>
                                    )}
                                    <button
                                      onClick={() => startEdit(platform)}
                                      className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                      data-testid={`forecast-edit-${platform.platformId}`}
                                      aria-label="Set expected growth rate"
                                      disabled={isSaving}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    {platform.expectedGrowthPct !== null && (
                                      <button
                                        onClick={() => clearGrowthRate(platform.platformId)}
                                        className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted/60 transition-colors"
                                        data-testid={`forecast-clear-${platform.platformId}`}
                                        aria-label="Clear growth rate"
                                        disabled={isSaving}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                )
                              ) : (
                                <span className={cn(
                                  "text-xs px-2 py-0.5 rounded-full font-medium",
                                  methodBadgeClass(platform.method)
                                )}>
                                  {platform.method}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300"
          data-testid="forecast-disclaimer"
        >
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold mb-1">Projections are estimates, not financial advice.</p>
            <p className="text-amber-700 dark:text-amber-400">
              Click the pencil icon next to any standard platform to set an expected annual growth %.
              This rate is saved to the platform and used for all future forecasts. Asset-return
              platforms use declared yields; item-valuation platforms are held flat.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
