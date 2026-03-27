import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePlatforms } from "@/hooks/use-platforms";
import { useAuth } from "@/App";
import { formatCurrency } from "@/lib/currency";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { TrendingUp, Award, Calendar, Percent, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CATEGORY_COLORS: Record<string, string> = {
  "Real Estate": "#3b82f6",
  "Stocks":      "#10b981",
  "Stock":       "#10b981",
  "Crypto":      "#f59e0b",
  "Loans":       "#8b5cf6",
  "Loan":        "#8b5cf6",
  "Bonds":       "#06b6d4",
  "Bond":        "#06b6d4",
  "Cash":        "#6b7280",
  "Bank":        "#6b7280",
  "Other":       "#ec4899",
};

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] || "#94a3b8";
}

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
  categories: string[];
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  positive?: boolean;
  neutral?: boolean;
}

function KpiCard({ label, value, sub, icon, positive, neutral }: KpiCardProps) {
  const valueColor = neutral
    ? "text-foreground"
    : positive
    ? "text-emerald-500"
    : "text-red-500";
  return (
    <Card data-testid={`kpi-card-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn("text-2xl font-bold mt-1", valueColor)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted/50">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

interface HeatmapTooltipData {
  label: string;
  returnPct: number;
  absoluteChange: number;
  currency: string;
}

function HeatmapTooltipCard({ label, returnPct, absoluteChange, currency }: HeatmapTooltipData) {
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs space-y-1 pointer-events-none">
      <p className="font-semibold">{label}</p>
      <p className={returnPct >= 0 ? "text-emerald-500" : "text-red-500"}>
        Return: {fmtPct(returnPct)}
      </p>
      <p className="text-muted-foreground">Change: {formatCurrency(absoluteChange, currency)}</p>
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
  const [sortKey, setSortKey] = useState<SortKey>("roi");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: platforms } = usePlatforms();

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

  const { data: flowData } = useQuery<InvestmentFlowResponse>({
    queryKey: ["/api/analytics/investment-flow"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/investment-flow", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch flow");
      return res.json();
    },
  });

  const kpis = useMemo(() => {
    if (!platforms || !historyData || historyData.length === 0) return null;

    const totalInvested = platforms.reduce((s, p) => s + (Number(p.totalInvested) || 0), 0);
    const totalCurrent = platforms.reduce((s, p) => s + (Number(p.currentValue) || 0), 0);
    const totalROI = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

    const first = historyData[0];
    const last = historyData[historyData.length - 1];
    const years =
      (new Date(last.date).getTime() - new Date(first.date).getTime()) /
      (1000 * 60 * 60 * 24 * 365.25);
    const cagr =
      first.value > 0 && years > 0
        ? (Math.pow(last.value / first.value, 1 / years) - 1) * 100
        : null;

    const bestPlatform = platforms.reduce(
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

    return { totalROI, cagr, bestPlatform, ageDays, ageMonths };
  }, [platforms, historyData]);

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

  const roiData = useMemo(() => {
    if (!platforms) return [];
    return platforms
      .map((p) => {
        const invested = Number(p.totalInvested) || 0;
        const current = Number(p.currentValue) || 0;
        const roi = invested > 0 ? ((current - invested) / invested) * 100 : 0;
        return { name: p.name, roi, color: p.color };
      })
      .sort((a, b) => b.roi - a.roi);
  }, [platforms]);

  const targetData = useMemo(() => {
    if (!platforms) return [];
    const totalCurrent = platforms.reduce((s, p) => s + (Number(p.currentValue) || 0), 0);
    return platforms
      .filter((p) => p.targetAllocation != null && Number(p.targetAllocation) > 0)
      .map((p) => {
        const current = Number(p.currentValue) || 0;
        const actual = totalCurrent > 0 ? (current / totalCurrent) * 100 : 0;
        const target = Number(p.targetAllocation);
        return { name: p.name, actual: parseFloat(actual.toFixed(2)), target };
      });
  }, [platforms]);

  const momMap = useMemo(() => {
    const m = new Map<number, number>();
    if (momData) for (const d of momData) m.set(d.platformId, d.momGrowthPercent);
    return m;
  }, [momData]);

  const tableData = useMemo(() => {
    if (!platforms) return [];
    const totalCurrent = platforms.reduce((s, p) => s + (Number(p.currentValue) || 0), 0);
    return platforms.map((p) => {
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
  }, [platforms, momMap]);

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
      <div className="space-y-8 pb-12">
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
          />
          <KpiCard
            label="CAGR"
            value={kpis?.cagr != null ? fmtPct(kpis.cagr) : "—"}
            sub="Compound annual growth rate"
            icon={<TrendingUp className="w-5 h-5 text-muted-foreground" />}
            positive={kpis?.cagr != null ? kpis.cagr >= 0 : undefined}
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
          <CardHeader>
            <CardTitle>Monthly Returns Heatmap</CardTitle>
            <CardDescription>
              Cash-flow adjusted return per calendar month — green = gain, red = loss
            </CardDescription>
          </CardHeader>
          <CardContent>
            {heatmapData ? (
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
                  {heatmapData.years.map((year) => (
                    <div key={year} className="flex items-center mb-1">
                      <div className="w-12 shrink-0 text-xs text-muted-foreground font-medium pr-2 text-right">
                        {year}
                      </div>
                      {Array.from({ length: 12 }, (_, mi) => {
                        const monthNum = mi + 1;
                        const cell = heatmapData.cells.find(
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
                              setTooltip({
                                x: rect.left + rect.width / 2,
                                y: rect.top,
                                data: { label, returnPct: cell.returnPct, absoluteChange: cell.absoluteChange, currency },
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            {fmtPct(cell.returnPct)}
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

        {/* ROI by Platform + Target vs Actual */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>ROI by Platform</CardTitle>
              <CardDescription>Sorted best to worst return on investment</CardDescription>
            </CardHeader>
            <CardContent>
              {roiData.length > 0 ? (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={roiData} layout="vertical" margin={{ left: 4, right: 48 }}>
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

          <Card>
            <CardHeader>
              <CardTitle>Target vs Actual Allocation</CardTitle>
              <CardDescription>How your current allocation compares to your targets</CardDescription>
            </CardHeader>
            <CardContent>
              {targetData.length > 0 ? (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={targetData} margin={{ left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v: number) => `${v}%`}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v: number) => [`${v.toFixed(2)}%`]}
                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                      />
                      <Legend />
                      <Bar dataKey="actual" name="Actual %" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                      <Bar dataKey="target" name="Target %" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[200px] gap-3 text-center">
                  <Target className="w-10 h-10 text-muted-foreground/40" />
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">No allocation targets set</p>
                    <p className="text-muted-foreground/70 text-xs mt-1">
                      Set target allocations on the Dashboard to see this chart.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monthly Investment Flow */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Investment Flow</CardTitle>
            <CardDescription>Net new capital deployed each month, broken down by category</CardDescription>
          </CardHeader>
          <CardContent>
            {flowData && flowData.months.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flowData.months} margin={{ left: 4 }}>
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
                    {flowData.categories.map((cat) => (
                      <Bar key={cat} dataKey={cat} stackId="flow" fill={categoryColor(cat)} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No investment data available.</p>
            )}
          </CardContent>
        </Card>

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
                      onClick={() => navigate(`/platforms/${p.id}`)}
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
    </Layout>
  );
}
