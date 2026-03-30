import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { DashboardFilter } from "@shared/schema";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PortfolioHeatmap, type EnrichedAsset } from "@/components/PortfolioHeatmap";
import { WaterfallChart } from "@/components/WaterfallChart";
import { Badge } from "@/components/ui/badge";
import { usePlatforms } from "@/hooks/use-platforms";
import { useAuth } from "@/App";
import { formatCurrency, formatCompactCurrency, getCurrencySymbol } from "@/lib/currency";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ReferenceLine,
} from "recharts";
import { TrendingUp, Award, Calendar, Percent, Target, Filter, Bookmark, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtMonthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return `${MONTHS[Number(mo) - 1]} ${y}`;
}

interface HistoryPoint {
  date: string;
  value: number;
  invested: number;
}

interface PlatformMomEntry {
  platformId: number;
  name: string;
  customIconUrl: string | null;
  currentValue: number;
  prevValue: number;
  momChange: number;
  momGrowthPercent: number;
}

interface InvestmentFlowResponse {
  months: Record<string, string | number>[];
  platforms: { name: string; color: string }[];
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  positive?: boolean;
  neutral?: boolean;
  chartData?: { label: string; value: number }[];
  chartIsCurrency?: boolean;
  currency?: string;
}

function KpiCard({ label, value, sub, icon, positive, neutral, chartData, chartIsCurrency, currency }: KpiCardProps) {
  const [hovered, setHovered] = useState(false);
  const valueColor = neutral
    ? "text-foreground"
    : positive
    ? "text-emerald-500"
    : "text-red-500";
  const chartColor = positive === false ? "#ef4444" : "#10b981";
  const gradId = `sparkGrad-${label.replace(/\s+/g, "")}`;
  return (
    <Card
      data-testid={`kpi-card-${label.toLowerCase().replace(/\s+/g, "-")}`}
      onMouseEnter={() => chartData?.length && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn("text-2xl font-bold mt-1", valueColor)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted/50">{icon}</div>
        </div>
        {chartData && chartData.length > 1 && (
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{ height: hovered ? 72 : 0, marginTop: hovered ? 12 : 0 }}
          >
            <div className="h-[72px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 0, bottom: 2 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis
                    tickFormatter={(v: number) =>
                      chartIsCurrency
                        ? formatCompactCurrency(v, currency ?? "EUR")
                        : `${v.toFixed(1)}%`
                    }
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={38}
                    tickCount={3}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.4} />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const val = payload[0].value as number;
                      const formatted = chartIsCurrency
                        ? `${val >= 0 ? "+" : ""}${formatCompactCurrency(val, currency ?? "EUR")}`
                        : fmtPct(val);
                      return (
                        <div className="bg-popover border rounded-md shadow-sm p-1.5 text-xs">
                          <p className="text-muted-foreground mb-0.5">{payload[0].payload.label}</p>
                          <p className={cn("font-semibold", val >= 0 ? "text-emerald-500" : "text-red-500")}>{formatted}</p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={chartColor}
                    strokeWidth={1.5}
                    fill={`url(#${gradId})`}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface PlatformGain {
  platformId: number;
  name: string;
  color: string;
  prevVal: number;
  currVal: number;
  gain: number;
  gainPct: number | null;
}

interface HeatmapTooltipData {
  label: string;
  returnPct: number;
  absoluteChange: number;
  currency: string;
  platformBreakdown?: PlatformGain[];
}

function HeatmapTooltipCard({ label, returnPct, absoluteChange, currency, platformBreakdown }: HeatmapTooltipData) {
  const significant = platformBreakdown?.filter(p => Math.abs(p.gain) > 0.01) ?? [];
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs pointer-events-none min-w-[200px]">
      <p className="font-semibold mb-1">{label}</p>
      <div className="flex justify-between gap-4 mb-2">
        <span className={returnPct >= 0 ? "text-emerald-500" : "text-red-500"}>
          {fmtPct(returnPct)}
        </span>
        <span className="text-muted-foreground">{formatCurrency(absoluteChange, currency)}</span>
      </div>
      {significant.length > 0 && (
        <>
          <div className="border-t my-2" />
          <div className="space-y-1">
            {significant.map(p => (
              <div key={p.platformId} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="flex-1 truncate text-muted-foreground">{p.name}</span>
                <span className={cn("font-medium shrink-0", p.gain >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {p.gain >= 0 ? "+" : ""}{formatCurrency(p.gain, currency)}
                  {p.gainPct != null && (
                    <span className="ml-1 opacity-70">({p.gainPct >= 0 ? "+" : ""}{p.gainPct.toFixed(2)}%)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type SortKey = "name" | "invested" | "current" | "pnl" | "roi" | "mom" | "target" | "delta";
type SortDir = "asc" | "desc";

export default function Analytics() {
  const { user } = useAuth();
  const currency = user?.currency || "EUR";
  const [, navigate] = useLocation();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: HeatmapTooltipData } | null>(null);
  const [heatmapMode, setHeatmapMode] = useState<"pct" | "value">("pct");
  const [sortKey, setSortKey] = useState<SortKey>("roi");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [excludedPlatforms, setExcludedPlatforms] = useState<Set<number>>(new Set());
  const [filterPresetsOpen, setFilterPresetsOpen] = useState(false);
  const [filterPresetName, setFilterPresetName] = useState("");
  const { toast } = useToast();

  const { data: savedFilters } = useQuery<DashboardFilter[]>({
    queryKey: ['/api/dashboard-filters'],
  });

  const saveFilterMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest('POST', '/api/dashboard-filters', { name, excludedPlatformIds: Array.from(excludedPlatforms) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard-filters'] });
      setFilterPresetName("");
      toast({ title: "Filter saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save filter", description: err.message, variant: "destructive" });
    },
  });

  const deleteFilterMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/dashboard-filters/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard-filters'] });
      toast({ title: "Filter deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete filter", description: err.message, variant: "destructive" });
    },
  });

  function togglePlatform(id: number) {
    setExcludedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const { data: platforms } = usePlatforms();

  const activePlatforms = useMemo(
    () => platforms?.filter((p) => !excludedPlatforms.has(p.id)),
    [platforms, excludedPlatforms]
  );

  const { data: historyData } = useQuery<HistoryPoint[]>({
    queryKey: ["/api/portfolio/history", "all"],
    queryFn: async () => {
      const res = await fetch("/api/portfolio/history?range=all", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  const { data: momData } = useQuery<PlatformMomEntry[]>({
    queryKey: ["/api/portfolio/platform-mom"],
    queryFn: async () => {
      const res = await fetch("/api/portfolio/platform-mom", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch MoM");
      return res.json();
    },
  });

  const { data: platformBreakdownByMonth } = useQuery<Record<string, PlatformGain[]>>({
    queryKey: ["/api/analytics/monthly-platform-breakdown"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/monthly-platform-breakdown", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch platform breakdown");
      return res.json();
    },
  });

  const { data: analyticsAssets } = useQuery<EnrichedAsset[]>({
    queryKey: ["/api/analytics/assets"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/assets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics assets");
      return res.json();
    },
  });

  const { data: flowData } = useQuery<InvestmentFlowResponse>({
    queryKey: ["/api/analytics/investment-flow", "by-platform"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/investment-flow", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch flow");
      return res.json();
    },
  });

  // Build the set of platform names that are currently excluded (for cross-referencing flow data by name)
  const excludedPlatformNames = useMemo(() => {
    if (!platforms) return new Set<string>();
    return new Set(platforms.filter((p) => excludedPlatforms.has(p.id)).map((p) => p.name));
  }, [platforms, excludedPlatforms]);

  // Filter the investment-flow platforms list and add a __total__ field per month for stack labels
  const filteredFlowPlatforms = useMemo(() => {
    if (!flowData?.platforms) return [];
    return flowData.platforms.filter((p) => !excludedPlatformNames.has(p.name));
  }, [flowData, excludedPlatformNames]);

  const filteredFlowMonths = useMemo(() => {
    if (!flowData?.months) return [];
    return flowData.months.map((month) => {
      let total = 0;
      for (const [key, val] of Object.entries(month)) {
        if (key !== "month" && !excludedPlatformNames.has(key)) total += (val as number) || 0;
      }
      return { ...month, __total__: total };
    });
  }, [flowData, excludedPlatformNames]);

  const kpis = useMemo(() => {
    if (!activePlatforms || !historyData || historyData.length === 0) return null;

    const totalInvested = activePlatforms.reduce((s, p) => s + (Number(p.totalInvested) || 0), 0);
    const totalCurrent = activePlatforms.reduce((s, p) => s + (Number(p.currentValue) || 0), 0);
    const totalROI = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

    const first = historyData[0];
    const last = historyData[historyData.length - 1];
    const years =
      (new Date(last.date).getTime() - new Date(first.date).getTime()) /
      (1000 * 60 * 60 * 24 * 365.25);

    // Time-Weighted Return — filter-aware when per-platform monthly data is available,
    // otherwise falls back to full-portfolio history.
    let twrFactor = 1;
    let validPeriods = 0;
    if (platformBreakdownByMonth) {
      const monthKeys = Object.keys(platformBreakdownByMonth).sort();
      for (const key of monthKeys) {
        const entries = platformBreakdownByMonth[key].filter((p) => !excludedPlatforms.has(p.platformId));
        const gain = entries.reduce((s, p) => s + p.gain, 0);
        const prevVal = entries.reduce((s, p) => s + p.prevVal, 0);
        if (prevVal > 0) { twrFactor *= (1 + gain / prevVal); validPeriods++; }
      }
    } else {
      for (let i = 1; i < historyData.length; i++) {
        const prev = historyData[i - 1];
        const curr = historyData[i];
        if (prev.value <= 0) continue;
        const netCashAdded = curr.invested - prev.invested;
        const periodReturn = (curr.value - prev.value - netCashAdded) / prev.value;
        twrFactor *= (1 + periodReturn);
        validPeriods++;
      }
    }
    const twr = validPeriods > 0 ? (twrFactor - 1) * 100 : null;
    const cagr = twr != null && years > 0
      ? (Math.pow(twrFactor, 1 / years) - 1) * 100
      : null;

    const bestPlatform = activePlatforms.reduce(
      (best, p) => {
        const invested = Number(p.totalInvested) || 0;
        const current = Number(p.currentValue) || 0;
        const roi = invested > 0 ? ((current - invested) / invested) * 100 : -Infinity;
        return roi > best.roi ? { name: p.name, roi } : best;
      },
      { name: "-", roi: -Infinity }
    );

    const ageMs = new Date().getTime() - new Date(first.date).getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const ageMonths = Math.floor(ageDays / 30);

    return { totalROI, cagr, twr, bestPlatform, ageDays, ageMonths };
  }, [activePlatforms, historyData, platformBreakdownByMonth, excludedPlatforms]);

  const heatmapData = useMemo(() => {
    if (!historyData || historyData.length < 2) return null;

    const monthMap = new Map<string, { value: number; invested: number }>();
    for (const point of historyData) {
      const d = new Date(point.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, { value: point.value, invested: point.invested });
    }

    const sortedKeys = Array.from(monthMap.keys()).sort();
    const years = Array.from(new Set(sortedKeys.map((k) => k.split("-")[0]))).sort();
    const cells: { year: string; month: number; returnPct: number; absoluteChange: number }[] = [];

    for (let i = 1; i < sortedKeys.length; i++) {
      const prevKey = sortedKeys[i - 1];
      const curKey = sortedKeys[i];
      const prev = monthMap.get(prevKey)!;
      const cur = monthMap.get(curKey)!;
      const [cy, cm] = curKey.split("-").map(Number);
      const absoluteChange = cur.value - prev.value - (cur.invested - prev.invested);
      const returnPct = prev.value > 0 ? (absoluteChange / prev.value) * 100 : 0;
      cells.push({ year: String(cy), month: cm, returnPct, absoluteChange });
    }

    return { years, cells };
  }, [historyData]);

  // When platforms are filtered, re-derive the heatmap from per-platform breakdown
  const filteredHeatmapData = useMemo(() => {
    if (!platformBreakdownByMonth || excludedPlatforms.size === 0) return null;

    const monthKeys = Object.keys(platformBreakdownByMonth).sort();
    if (monthKeys.length < 1) return null;

    const years = Array.from(new Set(monthKeys.map((k) => k.split("-")[0]))).sort();
    const cells: { year: string; month: number; returnPct: number; absoluteChange: number }[] = [];

    for (const key of monthKeys) {
      const entries = platformBreakdownByMonth[key].filter((p) => !excludedPlatforms.has(p.platformId));
      const filteredGain = entries.reduce((s, p) => s + p.gain, 0);
      const filteredPrevVal = entries.reduce((s, p) => s + p.prevVal, 0);
      const [cy, cm] = key.split("-").map(Number);
      const returnPct = filteredPrevVal > 0 ? (filteredGain / filteredPrevVal) * 100 : 0;
      cells.push({ year: String(cy), month: cm, returnPct, absoluteChange: filteredGain });
    }

    return { years, cells };
  }, [platformBreakdownByMonth, excludedPlatforms]);

  const activeHeatmapData = excludedPlatforms.size > 0 ? filteredHeatmapData : heatmapData;

  const roiData = useMemo(() => {
    if (!activePlatforms) return [];
    return activePlatforms
      .map((p) => {
        const invested = Number(p.totalInvested) || 0;
        const current = Number(p.currentValue) || 0;
        const roi = invested > 0 ? ((current - invested) / invested) * 100 : 0;
        return { name: p.name, roi, color: p.color };
      })
      .sort((a, b) => b.roi - a.roi);
  }, [activePlatforms]);

  const roiOverTimeData = useMemo(() => {
    if (platformBreakdownByMonth && activePlatforms) {
      const monthKeys = Object.keys(platformBreakdownByMonth).sort();

      // Actual total invested from platform records (excludes filtered platforms)
      const actualTotalInvested = activePlatforms
        .reduce((s, p) => s + (Number(p.totalInvested) || 0), 0);

      // Pass 1: sum all net cash deposits across every tracked month
      // netCash per month is derived as: currVal - prevVal - gain
      let totalNetCash = 0;
      for (const key of monthKeys) {
        const entries = platformBreakdownByMonth[key].filter((p) => !excludedPlatforms.has(p.platformId));
        for (const e of entries) totalNetCash += e.currVal - e.prevVal - e.gain;
      }

      // Capital that existed before the first tracked month's deposit activity
      const baseCapital = actualTotalInvested - totalNetCash;

      // Pass 2: build the chart points
      let twrFactor = 1;
      let cumulativeNetCash = 0;
      let monthsElapsed = 0;

      return monthKeys.map((key) => {
        const entries = platformBreakdownByMonth[key].filter((p) => !excludedPlatforms.has(p.platformId));
        const gain = entries.reduce((s, p) => s + p.gain, 0);
        const prevVal = entries.reduce((s, p) => s + p.prevVal, 0);
        const currVal = entries.reduce((s, p) => s + p.currVal, 0);
        const netCash = entries.reduce((s, p) => s + (p.currVal - p.prevVal - p.gain), 0);

        if (prevVal > 0) twrFactor *= (1 + gain / prevVal);
        cumulativeNetCash += netCash;
        monthsElapsed += 1;

        const totalInvestedAtMonth = baseCapital + cumulativeNetCash;
        const totalGainAtMonth = currVal - totalInvestedAtMonth;
        const roi = totalInvestedAtMonth > 0 ? (totalGainAtMonth / totalInvestedAtMonth) * 100 : 0;
        const annualized = monthsElapsed > 0 && twrFactor > 0
          ? (Math.pow(twrFactor, 12 / monthsElapsed) - 1) * 100
          : 0;
        const [y, m] = key.split("-");
        const label = `${MONTHS[Number(m) - 1]} ${y}`;
        return { date: `${key}-01`, label, roi, annualized, cumulative: totalGainAtMonth };
      });
    }
    if (!historyData || historyData.length === 0) return [];
    return historyData.map((p) => {
      const roi = p.invested > 0 ? ((p.value - p.invested) / p.invested) * 100 : 0;
      const d = new Date(p.date);
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      return { date: p.date, label, roi, annualized: roi, cumulative: p.value - p.invested };
    });
  }, [historyData, platformBreakdownByMonth, activePlatforms, excludedPlatforms]);

  const rebalancerData = useMemo(() => {
    if (!activePlatforms) return null;
    const totalPortfolioValue = (platforms ?? activePlatforms).reduce((s, p) => s + (Number(p.currentValue) || 0), 0);
    const withTargets = activePlatforms.filter((p) => p.targetAllocation != null && Number(p.targetAllocation) > 0);
    if (withTargets.length === 0) return null;

    const items = withTargets.map((p) => {
      const currentValue = Number(p.currentValue) || 0;
      const targetPct = Number(p.targetAllocation);
      const targetAmount = (targetPct / 100) * totalPortfolioValue;
      const surplus = currentValue - targetAmount;
      return { ...p, currentValue, targetPct, targetAmount, surplus };
    });

    const itemsWithPct = items.map((p) => ({
      ...p,
      currentPct: totalPortfolioValue > 0 ? (p.currentValue / totalPortfolioValue) * 100 : 0,
    }));

    const sources = itemsWithPct.filter((i) => i.surplus > 0.01).sort((a, b) => b.surplus - a.surplus);
    const destinations = itemsWithPct.filter((i) => i.surplus < -0.01).sort((a, b) => a.surplus - b.surplus);

    const srcRem = sources.map((s) => ({ ...s, remaining: s.surplus }));
    const dstRem = destinations.map((d) => ({ ...d, remaining: Math.abs(d.surplus) }));
    const flows: { from: (typeof itemsWithPct)[0]; to: (typeof itemsWithPct)[0]; amount: number }[] = [];
    let si = 0, di = 0;
    while (si < srcRem.length && di < dstRem.length) {
      const amount = Math.min(srcRem[si].remaining, dstRem[di].remaining);
      if (amount > 0.01) flows.push({ from: sources[si], to: destinations[di], amount });
      srcRem[si].remaining -= amount;
      dstRem[di].remaining -= amount;
      if (srcRem[si].remaining < 0.01) si++;
      if (dstRem[di].remaining < 0.01) di++;
    }

    // Donut slices use the same denominator as their displayed percentages
    const currentDonut = itemsWithPct.map((p) => ({ name: p.name, value: p.currentValue, color: p.color, pct: p.currentPct }));
    // Target donut uses targetPct as slice value so slices are proportional to target%
    const targetDonut = itemsWithPct.map((p) => ({ name: p.name, value: p.targetPct, color: p.color, pct: p.targetPct }));

    return { items: itemsWithPct, sources, destinations, flows, currentDonut, targetDonut };
  }, [activePlatforms, platforms]);

  const momMap = useMemo(() => {
    const m = new Map<number, number>();
    if (momData) for (const d of momData) m.set(d.platformId, d.momGrowthPercent);
    return m;
  }, [momData]);

  const tableData = useMemo(() => {
    if (!activePlatforms) return [];
    const totalCurrent = (platforms ?? activePlatforms).reduce((s, p) => s + (Number(p.currentValue) || 0), 0);
    return activePlatforms.map((p) => {
      const invested = Number(p.totalInvested) || 0;
      const current = Number(p.currentValue) || 0;
      const pnl = current - invested;
      const roi = invested > 0 ? (pnl / invested) * 100 : 0;
      const mom = momMap.has(p.id) ? momMap.get(p.id)! : null;
      const target = p.targetAllocation != null ? Number(p.targetAllocation) : null;
      const actual = totalCurrent > 0 ? (current / totalCurrent) * 100 : 0;
      const delta = target != null ? actual - target : null;
      return { ...p, invested, current, pnl, roi, mom, target, actual, delta };
    });
  }, [activePlatforms, platforms, momMap]);

  const sortedTable = useMemo(() => {
    const copy = [...tableData];
    copy.sort((a, b) => {
      if (sortKey === "name") {
        return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const av = { invested: a.invested, current: a.current, pnl: a.pnl, roi: a.roi, mom: a.mom ?? -Infinity, target: a.target ?? -Infinity, delta: a.delta ?? -Infinity, name: 0 }[sortKey];
      const bv = { invested: b.invested, current: b.current, pnl: b.pnl, roi: b.roi, mom: b.mom ?? -Infinity, target: b.target ?? -Infinity, delta: b.delta ?? -Infinity, name: 0 }[sortKey];
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [tableData, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIndicator({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-muted-foreground/40 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <Layout>
      <div className="flex items-start gap-6 pb-12">
        <div className="flex-1 min-w-0 space-y-8">
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight">Analytics</h1>
            <p className="text-muted-foreground">Deep dive into your portfolio performance.</p>
          </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total ROI"
            value={kpis ? fmtPct(kpis.totalROI) : "—"}
            sub="All-time return on invested capital"
            icon={<Percent className="w-5 h-5 text-muted-foreground" />}
            positive={kpis ? kpis.totalROI >= 0 : undefined}
            chartData={roiOverTimeData.map((p) => ({ label: p.label, value: p.roi }))}
            currency={currency}
          />
          <KpiCard
            label="Ann. Return"
            value={kpis?.cagr != null ? fmtPct(kpis.cagr) : "—"}
            sub={kpis?.twr != null ? `${fmtPct(kpis.twr)} cumulative · cash-flow adjusted` : "Time-weighted, annualized"}
            icon={<TrendingUp className="w-5 h-5 text-muted-foreground" />}
            positive={kpis?.cagr != null ? kpis.cagr >= 0 : undefined}
            chartData={roiOverTimeData.map((p) => ({ label: p.label, value: p.annualized }))}
            currency={currency}
          />
          <KpiCard
            label="Best Platform"
            value={kpis && kpis.bestPlatform.roi > -Infinity ? kpis.bestPlatform.name : "—"}
            sub={kpis && kpis.bestPlatform.roi > -Infinity ? `${fmtPct(kpis.bestPlatform.roi)} ROI` : undefined}
            icon={<Award className="w-5 h-5 text-muted-foreground" />}
            neutral
          />
          <KpiCard
            label="Portfolio Age"
            value={kpis ? `${kpis.ageMonths} months` : "—"}
            sub={kpis ? `${kpis.ageDays} days since first entry` : undefined}
            icon={<Calendar className="w-5 h-5 text-muted-foreground" />}
            neutral
          />
        </div>

        {/* Monthly Returns Heatmap */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Monthly Returns Heatmap</CardTitle>
              <CardDescription>
                Cash-flow adjusted return per calendar month — green = gain, red = loss
              </CardDescription>
            </div>
            <div className="flex items-center rounded-md border p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setHeatmapMode("pct")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                  heatmapMode === "pct"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-testid="heatmap-toggle-pct"
              >
                %
              </button>
              <button
                type="button"
                onClick={() => setHeatmapMode("value")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                  heatmapMode === "value"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-testid="heatmap-toggle-value"
              >
                {getCurrencySymbol(currency)}
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {activeHeatmapData ? (
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  <div className="flex mb-1">
                    <div className="w-12 shrink-0" />
                    {MONTHS.map((m) => (
                      <div key={m} className="flex-1 text-center text-xs text-muted-foreground font-medium">
                        {m}
                      </div>
                    ))}
                  </div>
                  {activeHeatmapData.years.map((year) => (
                    <div key={year} className="flex items-center mb-1">
                      <div className="w-12 shrink-0 text-xs text-muted-foreground font-medium pr-2 text-right">
                        {year}
                      </div>
                      {Array.from({ length: 12 }, (_, mi) => {
                        const monthNum = mi + 1;
                        const cell = activeHeatmapData.cells.find(
                          (c) => c.year === year && c.month === monthNum
                        );
                        if (!cell) {
                          return <div key={monthNum} className="flex-1 mx-0.5 h-10 rounded bg-muted/30" />;
                        }
                        const intensity = Math.min(Math.abs(cell.returnPct) / 5, 1);
                        const bg = cell.returnPct >= 0
                          ? `rgba(16,185,129,${0.15 + intensity * 0.75})`
                          : `rgba(239,68,68,${0.15 + intensity * 0.75})`;
                        const label = `${MONTHS[monthNum - 1]} ${year}`;
                        return (
                          <div
                            key={monthNum}
                            className="flex-1 mx-0.5 h-10 rounded flex items-center justify-center text-[10px] font-medium cursor-default transition-transform hover:scale-105"
                            style={{ backgroundColor: bg, color: intensity > 0.5 ? "#fff" : undefined }}
                            data-testid={`heatmap-cell-${year}-${monthNum}`}
                            onMouseEnter={(e) => {
                              const rect = (e.target as HTMLElement).getBoundingClientRect();
                              const ymKey = `${year}-${String(monthNum).padStart(2, "0")}`;
                              setTooltip({
                                x: rect.left + rect.width / 2,
                                y: rect.top,
                                data: {
                                  label,
                                  returnPct: cell.returnPct,
                                  absoluteChange: cell.absoluteChange,
                                  currency,
                                  platformBreakdown: platformBreakdownByMonth?.[ymKey]?.filter(
                                    (p) => !excludedPlatforms.has(p.platformId)
                                  ),
                                },
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            {heatmapMode === "pct"
                              ? fmtPct(cell.returnPct)
                              : formatCompactCurrency(cell.absoluteChange, currency)}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Not enough history data to build heatmap.</p>
            )}
          </CardContent>
        </Card>

        {tooltip && (
          <div
            className="fixed z-50 pointer-events-none"
            style={{ left: tooltip.x, top: tooltip.y - 8, transform: "translate(-50%, -100%)" }}
          >
            <HeatmapTooltipCard {...tooltip.data} />
          </div>
        )}

        {/* Portfolio Heatmap */}
        <Card data-testid="portfolio-heatmap-card">
          <CardHeader>
            <CardTitle>Portfolio Heatmap</CardTitle>
            <CardDescription>
              Drill into your portfolio by category → platform → asset. Green = positive return, red = negative.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {platforms && (
              <PortfolioHeatmap
                assets={analyticsAssets ?? []}
                platforms={platforms}
                excludedPlatforms={excludedPlatforms}
                currency={currency}
              />
            )}
          </CardContent>
        </Card>

        {/* ROI by Platform */}
        <Card>
          <CardHeader>
            <CardTitle>ROI by Platform</CardTitle>
            <CardDescription>Sorted best to worst return on investment</CardDescription>
          </CardHeader>
          <CardContent>
            {roiData.length > 0 ? (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roiData} layout="vertical" margin={{ left: 4, right: 56 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={90}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: number) => [`${v.toFixed(2)}%`, "ROI"]}
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                    />
                    <Bar
                      dataKey="roi"
                      radius={[0, 4, 4, 0]}
                      barSize={18}
                      label={{ position: "right", formatter: (v: number) => `${v.toFixed(1)}%`, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    >
                      {roiData.map((entry, i) => (
                        <Cell key={i} fill={entry.roi >= 0 ? "#10b981" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No platform data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Portfolio Rebalancer */}
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Rebalancer</CardTitle>
            <CardDescription>
              Current vs target allocation — and exactly where to move capital to rebalance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rebalancerData ? (
              <div className="space-y-8">
                {/* Allocation stacked bar chart */}
                <div className="h-[280px]" data-testid="rebalancer-alloc-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[...rebalancerData.items].sort((a, b) => b.targetPct - a.targetPct).map((item) => {
                        const over = item.currentPct > item.targetPct;
                        return {
                          name: item.name,
                          currentPct: item.currentPct,
                          targetPct: item.targetPct,
                          green: over ? item.targetPct : item.currentPct,
                          gray: over ? 0 : item.targetPct - item.currentPct,
                          red: over ? item.currentPct - item.targetPct : 0,
                        };
                      })}
                      margin={{ top: 4, right: 8, bottom: 40, left: 8 }}
                      barCategoryGap="30%"
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        angle={-35}
                        textAnchor="end"
                        interval={0}
                      />
                      <YAxis
                        tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0]?.payload as { name: string; currentPct: number; targetPct: number } | undefined;
                          if (!d) return null;
                          const delta = d.currentPct - d.targetPct;
                          const sign = delta >= 0 ? "+" : "";
                          return (
                            <div style={{ borderRadius: 8, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", padding: "8px 12px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                              <p style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</p>
                              <p>Current: <strong>{d.currentPct.toFixed(1)}%</strong></p>
                              <p>Target: <strong>{d.targetPct.toFixed(1)}%</strong></p>
                              <p style={{ color: delta > 0 ? "#ef4444" : delta < 0 ? "#10b981" : "inherit" }}>
                                Delta: <strong>{sign}{delta.toFixed(1)}%</strong>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="green" stackId="alloc" fill="#10b981" isAnimationActive={false} />
                      <Bar dataKey="gray"  stackId="alloc" fill="#d1d5db" isAnimationActive={false} />
                      <Bar dataKey="red"   stackId="alloc" fill="#ef4444" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Chart legend */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-emerald-500" />Achieved</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-gray-300" />Gap to target</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-red-500" />Over target</span>
                </div>

                {/* Shared legend */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
                  {rebalancerData.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 min-w-0" data-testid={`legend-item-${item.id}`}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-muted-foreground truncate">{item.name}</span>
                      <span className="text-xs font-medium ml-auto shrink-0">
                        {item.currentPct.toFixed(1)}% / {item.targetPct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-6 space-y-6">
                  {/* Over / Under panel */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-semibold text-red-500 mb-3">Over-Allocated</p>
                      {rebalancerData.sources.length === 0 ? (
                        <p className="text-xs text-muted-foreground">All platforms are at or below their target.</p>
                      ) : (
                        <div className="space-y-2">
                          {rebalancerData.sources.map((p) => (
                            <div key={p.id} className="flex items-center gap-2" data-testid={`over-item-${p.id}`}>
                              <PlatformIcon icon={p.icon} customIconUrl={p.customIconUrl} color={p.color} name={p.name} size="sm" />
                              <span className="text-sm flex-1 truncate">{p.name}</span>
                              <span className="text-sm font-semibold text-red-500 shrink-0">
                                +{formatCurrency(p.surplus, currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-500 mb-3">Under-Allocated</p>
                      {rebalancerData.destinations.length === 0 ? (
                        <p className="text-xs text-muted-foreground">All platforms are at or above their target.</p>
                      ) : (
                        <div className="space-y-2">
                          {rebalancerData.destinations.map((p) => (
                            <div key={p.id} className="flex items-center gap-2" data-testid={`under-item-${p.id}`}>
                              <PlatformIcon icon={p.icon} customIconUrl={p.customIconUrl} color={p.color} name={p.name} size="sm" />
                              <span className="text-sm flex-1 truncate">{p.name}</span>
                              <span className="text-sm font-semibold text-emerald-500 shrink-0">
                                −{formatCurrency(Math.abs(p.surplus), currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[200px] gap-3 text-center">
                <Target className="w-10 h-10 text-muted-foreground/40" />
                <div>
                  <p className="text-muted-foreground text-sm font-medium">No allocation targets set</p>
                  <p className="text-muted-foreground/70 text-xs mt-1">
                    Set target allocations on the Dashboard to see the rebalancer.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Investment Flow */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Investment Flow</CardTitle>
            <CardDescription>Net new capital deployed each month, broken down by platform</CardDescription>
          </CardHeader>
          <CardContent>
            {flowData && flowData.months.length > 0 && flowData.platforms ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filteredFlowMonths} margin={{ left: 4, top: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={fmtMonthLabel}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatCurrency(v, currency)}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatCurrency(v, currency), name]}
                      labelFormatter={fmtMonthLabel}
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                    />
                    <Legend />
                    {filteredFlowPlatforms.map((p, i) => (
                      <Bar key={p.name} dataKey={p.name} stackId="flow" fill={p.color}>
                        {i === filteredFlowPlatforms.length - 1 && (
                          <LabelList
                            dataKey="__total__"
                            position="top"
                            formatter={(v: number) => v > 0 ? formatCompactCurrency(v, currency) : ""}
                            style={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontWeight: 500 }}
                          />
                        )}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No investment data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Portfolio Waterfall */}
        <WaterfallChart currency={currency} excludedPlatforms={excludedPlatforms} />

        {/* Platform Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Performance Table</CardTitle>
            <CardDescription>
              Click a column header to sort — click a row to view platform details
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="platform-performance-table">
                <thead>
                  <tr className="border-b">
                    {(
                      [
                        { key: "name", label: "Name" },
                        { key: "invested", label: "Invested" },
                        { key: "current", label: "Current Value" },
                        { key: "pnl", label: "P&L" },
                        { key: "roi", label: "ROI %" },
                        { key: "mom", label: "MoM %" },
                        { key: "target", label: "Target %" },
                        { key: "delta", label: "Delta" },
                      ] as { key: SortKey; label: string }[]
                    ).map(({ key, label }) => (
                      <th
                        key={key}
                        className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap"
                        onClick={() => toggleSort(key)}
                        data-testid={`table-sort-${key}`}
                      >
                        {label}
                        <SortIndicator col={key} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedTable.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/platforms/${encodeURIComponent(p.name.toLowerCase().replace(/\s+/g, '-'))}`)}
                      data-testid={`table-row-platform-${p.id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <PlatformIcon
                            icon={p.icon}
                            customIconUrl={p.customIconUrl}
                            color={p.color}
                            name={p.name}
                            size="sm"
                          />
                          <span className="font-medium">{p.name}</span>
                          <Badge variant="outline" className="text-[10px] py-0 h-4 hidden sm:inline-flex">
                            {p.category}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatCurrency(p.invested, currency)}</td>
                      <td className="px-4 py-3 font-medium">{formatCurrency(p.current, currency)}</td>
                      <td className={cn("px-4 py-3 font-medium", p.pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {p.pnl >= 0 ? "+" : ""}{formatCurrency(p.pnl, currency)}
                      </td>
                      <td className={cn("px-4 py-3 font-medium", p.roi >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {fmtPct(p.roi)}
                      </td>
                      <td className={cn("px-4 py-3", p.mom != null ? (p.mom >= 0 ? "text-emerald-500" : "text-red-500") : "text-muted-foreground")}>
                        {p.mom != null ? fmtPct(p.mom) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.target != null ? `${p.target.toFixed(1)}%` : "—"}
                      </td>
                      <td className={cn("px-4 py-3", p.delta != null ? (p.delta >= 0 ? "text-emerald-500" : "text-red-500") : "text-muted-foreground")}>
                        {p.delta != null ? `${p.delta >= 0 ? "+" : ""}${p.delta.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                  {sortedTable.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                        No platforms found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        </div>

        {platforms && platforms.length > 0 && (
          <aside className="sticky top-6 shrink-0 w-52 self-start">
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Filter className="w-3.5 h-3.5" />
                    Platforms
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-xs"
                      onClick={() => setExcludedPlatforms(new Set())}
                      data-testid="analytics-select-all"
                    >
                      All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-xs"
                      onClick={() => setExcludedPlatforms(new Set(platforms.map(p => p.id)))}
                      data-testid="analytics-deselect-all"
                    >
                      None
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-0.5">
                  {platforms.map((p) => {
                    const excluded = excludedPlatforms.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePlatform(p.id)}
                        data-testid={`analytics-filter-platform-${p.id}`}
                        title={excluded ? `Include ${p.name}` : `Exclude ${p.name}`}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-all text-left w-full",
                          excluded ? "opacity-35 text-muted-foreground" : "hover:bg-muted/60"
                        )}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: excluded ? "#888" : p.color }}
                        />
                        {p.name}
                      </button>
                    );
                  })}
                </div>

                <div className="border-t pt-3">
                  <Popover open={filterPresetsOpen} onOpenChange={setFilterPresetsOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 gap-1 text-xs justify-start"
                        data-testid="button-analytics-filter-presets"
                      >
                        <Bookmark className="w-3 h-3" />
                        Presets
                        {savedFilters && savedFilters.length > 0 && (
                          <span className="bg-primary/10 text-primary rounded-full px-1 ml-auto">
                            {savedFilters.length}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="left"
                      align="start"
                      className="w-72 p-3"
                      data-testid="popover-analytics-filter-presets"
                    >
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Saved Filter Presets</p>
                        {savedFilters && savedFilters.length > 0 ? (
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {savedFilters.map((filter) => (
                              <div
                                key={filter.id}
                                className="flex items-center gap-2 group"
                                data-testid={`analytics-preset-${filter.id}`}
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="flex-1 justify-start text-sm h-8"
                                  onClick={() => {
                                    setExcludedPlatforms(new Set(filter.excludedPlatformIds));
                                    setFilterPresetsOpen(false);
                                  }}
                                  data-testid={`button-analytics-apply-filter-${filter.id}`}
                                >
                                  {filter.name}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteFilterMutation.mutate(filter.id);
                                  }}
                                  data-testid={`button-analytics-delete-filter-${filter.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No saved presets yet. Toggle platforms and save them here.
                          </p>
                        )}
                        <div className="border-t pt-3">
                          <p className="text-xs text-muted-foreground mb-2">Save current filter as preset</p>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Preset name..."
                              value={filterPresetName}
                              onChange={(e) => setFilterPresetName(e.target.value)}
                              className="h-8 text-sm"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && filterPresetName.trim())
                                  saveFilterMutation.mutate(filterPresetName.trim());
                              }}
                              data-testid="input-analytics-filter-preset-name"
                            />
                            <Button
                              size="sm"
                              className="h-8 px-3"
                              disabled={!filterPresetName.trim() || saveFilterMutation.isPending}
                              onClick={() => saveFilterMutation.mutate(filterPresetName.trim())}
                              data-testid="button-analytics-save-filter-preset"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </CardContent>
            </Card>
          </aside>
        )}
      </div>
    </Layout>
  );
}
