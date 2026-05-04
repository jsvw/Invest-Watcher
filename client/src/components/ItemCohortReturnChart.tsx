import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { BarChart2, Table2, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CohortData {
  cohortKey: string;
  cohortLabel: string;
  data: { calendarMonth: string; calendarLabel: string; avgReturn: number; assetCount: number }[];
}

interface AssetRow {
  assetId: number;
  assetName: string;
  status: string;
  investedAmount: number;
  data: { calendarMonth: string; calendarLabel: string; returnPct: number }[];
}

import type { AssetStatusFilter } from "@/components/AssetInsightTabs";

interface ItemCohortReturnChartProps {
  platformId: number;
  statusFilter?: AssetStatusFilter;
}

const COLORS = [
  "#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#00C49F",
  "#FFBB28", "#FF8042", "#0088FE", "#a4de6c", "#d0ed57"
];

function fmtReturn(val: number | undefined): string {
  if (val === undefined || val === null) return "—";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

function monthToQuarterKey(month: string): string {
  const [year, m] = month.split("-");
  const q = Math.ceil(parseInt(m) / 3);
  return `${year}-Q${q}`;
}

function quarterKeyToLabel(key: string): string {
  const [year, q] = key.split("-");
  return `${q} ${year}`;
}

function getHeatmapStyle(val: number | undefined, maxAbs: number): CSSProperties {
  if (val === undefined || val === null || maxAbs === 0) return {};
  const intensity = Math.min(Math.abs(val) / maxAbs, 1);
  const alpha = 0.1 + intensity * 0.55;
  if (val > 0) return { backgroundColor: `rgba(16, 185, 129, ${alpha})` };
  if (val < 0) return { backgroundColor: `rgba(239, 68, 68, ${alpha})` };
  return {};
}

function buildAssetDataMap(
  asset: AssetRow,
  allPeriods: string[],
  granularity: "month" | "quarter"
): Map<string, number> {
  if (granularity === "month") {
    return new Map(asset.data.map(d => [d.calendarMonth, d.returnPct]));
  }
  return new Map(
    allPeriods
      .map(qKey => {
        const monthsInQ = asset.data.filter(d => monthToQuarterKey(d.calendarMonth) === qKey);
        const vals = monthsInQ.map(d => d.returnPct);
        if (vals.length === 0) return null;
        return [qKey, vals.reduce((a, b) => a + b, 0) / vals.length] as [string, number];
      })
      .filter((x): x is [string, number] => x !== null)
  );
}

type SortMode = "name" | "best" | "worst";

function SheetSortBtn({ mode, label, icon, activeSort, onSort }: {
  mode: SortMode;
  label: string;
  icon: React.ElementType;
  activeSort: SortMode;
  onSort: (m: SortMode) => void;
}) {
  const Icon = icon;
  return (
    <button
      onClick={() => onSort(mode)}
      data-testid={`btn-cohort-sort-${mode}`}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
        activeSort === mode
          ? "bg-background shadow-sm text-foreground border border-border"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

interface CohortDetailSheetProps {
  cohort: CohortData | null;
  platformId: number;
  statusFilter: string;
  rawMonths: string[];
  rawMonthLabels: Map<string, string>;
  maxAbs: number;
  open: boolean;
  onClose: () => void;
}

function CohortDetailSheet({
  cohort,
  platformId,
  statusFilter,
  rawMonths,
  rawMonthLabels,
  maxAbs,
  open,
  onClose,
}: CohortDetailSheetProps) {
  const [sort, setSort] = useState<SortMode>("name");
  const [sheetGranularity, setSheetGranularity] = useState<"month" | "quarter">("month");

  const { data, isLoading } = useQuery<AssetRow[]>({
    queryKey: ['/api/platforms', platformId, 'item-cohort-assets', cohort?.cohortKey ?? "", statusFilter],
    queryFn: async () => {
      const url = `/api/platforms/${platformId}/item-cohort-assets?cohortKey=${cohort!.cohortKey}&statusFilter=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch asset data");
      return res.json();
    },
    enabled: open && cohort !== null,
  });

  const { sheetAllPeriods, sheetPeriodLabels } = useMemo(() => {
    if (sheetGranularity === "month") {
      return { sheetAllPeriods: rawMonths, sheetPeriodLabels: rawMonthLabels };
    }
    const qKeySet = new Set<string>();
    rawMonths.forEach(m => qKeySet.add(monthToQuarterKey(m)));
    const sortedQuarters = Array.from(qKeySet).sort();
    const qLblMap = new Map<string, string>();
    sortedQuarters.forEach(qKey => qLblMap.set(qKey, quarterKeyToLabel(qKey)));
    return { sheetAllPeriods: sortedQuarters, sheetPeriodLabels: qLblMap };
  }, [rawMonths, rawMonthLabels, sheetGranularity]);

  const visiblePeriods = useMemo(() => {
    if (!cohort) return sheetAllPeriods;
    if (sheetGranularity === "month") {
      return sheetAllPeriods.filter(m => m >= cohort.cohortKey);
    }
    const cohortQuarter = monthToQuarterKey(cohort.cohortKey);
    return sheetAllPeriods.filter(q => q >= cohortQuarter);
  }, [sheetAllPeriods, cohort, sheetGranularity]);

  const lastPeriod = visiblePeriods[visiblePeriods.length - 1];

  const sortedAssets = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      if (sort === "name") return a.assetName.localeCompare(b.assetName);
      const aMap = buildAssetDataMap(a, visiblePeriods, sheetGranularity);
      const bMap = buildAssetDataMap(b, visiblePeriods, sheetGranularity);
      const aVal = lastPeriod ? aMap.get(lastPeriod) : undefined;
      const bVal = lastPeriod ? bMap.get(lastPeriod) : undefined;
      if (sort === "best") {
        if (aVal === undefined && bVal === undefined) return 0;
        if (aVal === undefined) return 1;
        if (bVal === undefined) return -1;
        return bVal - aVal;
      }
      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;
      return aVal - bVal;
    });
  }, [data, sort, visiblePeriods, sheetGranularity, lastPeriod]);

  const totalInvested = data ? data.reduce((s, a) => s + a.investedAmount, 0) : 0;
  const assetCount = data ? data.length : (cohort?.data[cohort.data.length - 1]?.assetCount ?? 0);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[95vw] flex flex-col p-0 gap-0"
        data-testid="cohort-detail-sheet"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="pr-6">
            <SheetTitle data-testid="sheet-cohort-title">
              {cohort?.cohortLabel ?? ""} Cohort
            </SheetTitle>
            <SheetDescription data-testid="sheet-cohort-meta">
              {isLoading
                ? "Loading assets…"
                : `${assetCount} asset${assetCount !== 1 ? "s" : ""} · €${totalInvested.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} invested`}
            </SheetDescription>
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/50">
              <button
                data-testid="btn-sheet-granularity-month"
                onClick={() => setSheetGranularity("month")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  sheetGranularity === "month" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Month
              </button>
              <button
                data-testid="btn-sheet-granularity-quarter"
                onClick={() => setSheetGranularity("quarter")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  sheetGranularity === "quarter" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Quarter
              </button>
            </div>
            <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/50">
              <SheetSortBtn mode="name" label="Name A→Z" icon={ArrowUpDown} activeSort={sort} onSort={setSort} />
              <SheetSortBtn mode="best" label="Best return" icon={ArrowUp} activeSort={sort} onSort={setSort} />
              <SheetSortBtn mode="worst" label="Worst return" icon={ArrowDown} activeSort={sort} onSort={setSort} />
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-4 py-4" data-testid="sheet-asset-table-container">
          {isLoading ? (
            <div className="space-y-2 pt-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground italic">
              No individual asset data available for this cohort.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-background text-left font-medium text-muted-foreground py-2 pr-4 pl-1 whitespace-nowrap border-b min-w-[180px]">
                      Asset
                    </th>
                    {visiblePeriods.map(period => (
                      <th
                        key={period}
                        className="text-center font-medium text-muted-foreground py-2 px-2 whitespace-nowrap border-b min-w-[72px]"
                        data-testid={`sheet-th-${period}`}
                      >
                        {sheetPeriodLabels.get(period) || period}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAssets.map(asset => {
                    const dataMap = buildAssetDataMap(asset, visiblePeriods, sheetGranularity);
                    return (
                      <tr key={asset.assetId} data-testid={`sheet-asset-row-${asset.assetId}`}>
                        <td className="sticky left-0 z-10 bg-background py-2 pr-4 pl-1 whitespace-nowrap border-b border-muted/40">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-foreground font-medium truncate max-w-[130px]"
                              title={asset.assetName}
                            >
                              {asset.assetName}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                              asset.status === "active"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {asset.status}
                            </span>
                          </div>
                        </td>
                        {visiblePeriods.map(period => {
                          const val = dataMap.get(period);
                          return (
                            <td
                              key={period}
                              className="text-center py-2 px-2 border-b border-muted/40 tabular-nums text-foreground"
                              style={getHeatmapStyle(val, maxAbs)}
                              data-testid={`sheet-cell-${asset.assetId}-${period}`}
                            >
                              {fmtReturn(val)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t flex items-center gap-3 text-[10px] text-muted-foreground flex-shrink-0">
          <span className="font-medium">Color scale:</span>
          <div className="flex items-center gap-1">
            <div className="w-14 h-3 rounded-sm" style={{ background: "linear-gradient(to right, rgba(239,68,68,0.65), rgba(239,68,68,0.1))" }} />
            <span>Large loss → Small loss</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-14 h-3 rounded-sm" style={{ background: "linear-gradient(to right, rgba(16,185,129,0.1), rgba(16,185,129,0.65))" }} />
            <span>Small gain → Large gain</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ItemCohortReturnChart({ platformId, statusFilter = "all" }: ItemCohortReturnChartProps) {
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const [chartExpanded, setChartExpanded] = useState(false);
  const [granularity, setGranularity] = useState<"month" | "quarter">("month");
  const [selectedCohort, setSelectedCohort] = useState<CohortData | null>(null);

  const { data: cohortData, isLoading } = useQuery<CohortData[]>({
    queryKey: ['/api/platforms', platformId, 'item-cohort-returns', statusFilter],
    queryFn: async () => {
      const url = `/api/platforms/${platformId}/item-cohort-returns?statusFilter=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cohort data");
      return await res.json();
    }
  });

  const { chartData, allMonths, monthLabels, cohortInfoMap, rawMonths, rawMonthLabels } = useMemo(() => {
    const empty = { chartData: [], allMonths: [], monthLabels: new Map<string, string>(), cohortInfoMap: new Map<string, Map<string, number>>(), rawMonths: [] as string[], rawMonthLabels: new Map<string, string>() };
    if (!cohortData || cohortData.length === 0) return empty;

    const monthSet = new Set<string>();
    const lblMap = new Map<string, string>();
    const infoMap = new Map<string, Map<string, number>>();

    cohortData.forEach(cohort => {
      infoMap.set(cohort.cohortLabel, new Map());
      cohort.data.forEach(d => {
        monthSet.add(d.calendarMonth);
        lblMap.set(d.calendarMonth, d.calendarLabel);
        infoMap.get(cohort.cohortLabel)!.set(d.calendarMonth, d.assetCount);
      });
    });

    const sortedMonths = Array.from(monthSet).sort();

    if (granularity === "month") {
      const data = sortedMonths.map(month => {
        const row: Record<string, string | number | undefined> = {
          calendarMonth: month,
          calendarLabel: lblMap.get(month) || month
        };
        cohortData.forEach(cohort => {
          const point = cohort.data.find(d => d.calendarMonth === month);
          if (point) row[cohort.cohortLabel] = point.avgReturn;
        });
        return row;
      });
      return { chartData: data, allMonths: sortedMonths, monthLabels: lblMap, cohortInfoMap: infoMap, rawMonths: sortedMonths, rawMonthLabels: lblMap };
    }

    const qKeySet = new Set<string>();
    sortedMonths.forEach(m => qKeySet.add(monthToQuarterKey(m)));
    const sortedQuarters = Array.from(qKeySet).sort();

    const qLblMap = new Map<string, string>();
    sortedQuarters.forEach(qKey => qLblMap.set(qKey, quarterKeyToLabel(qKey)));

    const qInfoMap = new Map<string, Map<string, number>>();
    cohortData.forEach(cohort => {
      const qm = new Map<string, number>();
      sortedQuarters.forEach(qKey => {
        const total = sortedMonths
          .filter(m => monthToQuarterKey(m) === qKey)
          .reduce((sum, m) => sum + (infoMap.get(cohort.cohortLabel)?.get(m) ?? 0), 0);
        qm.set(qKey, total);
      });
      qInfoMap.set(cohort.cohortLabel, qm);
    });

    const data = sortedQuarters.map(qKey => {
      const row: Record<string, string | number | undefined> = {
        calendarMonth: qKey,
        calendarLabel: qLblMap.get(qKey) || qKey
      };
      cohortData.forEach(cohort => {
        const monthsInQ = sortedMonths.filter(m => monthToQuarterKey(m) === qKey);
        const vals = monthsInQ
          .map(m => cohort.data.find(d => d.calendarMonth === m)?.avgReturn)
          .filter((v): v is number => v !== undefined);
        if (vals.length > 0) row[cohort.cohortLabel] = vals.reduce((a, b) => a + b, 0) / vals.length;
      });
      return row;
    });

    return { chartData: data, allMonths: sortedQuarters, monthLabels: qLblMap, cohortInfoMap: qInfoMap, rawMonths: sortedMonths, rawMonthLabels: lblMap };
  }, [cohortData, granularity]);

  const granularityToggle = (
    <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/50">
      <button
        data-testid="btn-cohort-granularity-month"
        onClick={() => setGranularity("month")}
        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          granularity === "month" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Month
      </button>
      <button
        data-testid="btn-cohort-granularity-quarter"
        onClick={() => setGranularity("quarter")}
        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          granularity === "quarter" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Quarter
      </button>
    </div>
  );

  const viewToggle = (
    <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/50">
      <button
        data-testid="btn-cohort-view-chart"
        onClick={() => setViewMode("chart")}
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          viewMode === "chart" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <BarChart2 className="h-3.5 w-3.5" />
        Chart
      </button>
      <button
        data-testid="btn-cohort-view-table"
        onClick={() => setViewMode("table")}
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          viewMode === "table" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Table2 className="h-3.5 w-3.5" />
        Table
      </button>
    </div>
  );

  const xLabel = granularity === "quarter" ? "quarters" : "calendar months";

  if (isLoading) {
    return (
      <Card data-testid="card-item-cohort-returns">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Returns by Investment Cohort</CardTitle>
              <CardDescription>Loading chart data...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent><Skeleton className="h-[300px] w-full" /></CardContent>
      </Card>
    );
  }

  if (!cohortData || cohortData.length === 0) {
    return (
      <Card data-testid="card-item-cohort-returns">
        <CardHeader>
          <CardTitle>Returns by Investment Cohort</CardTitle>
          <CardDescription>Shows how returns evolve over time for assets grouped by acquisition month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No valuation data available yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxAbs = cohortData.reduce((m, cohort) =>
    cohort.data.reduce((m2, d) => Math.max(m2, Math.abs(d.avgReturn)), m), 0
  );

  return (
    <div className="contents">
      <Card data-testid="card-item-cohort-returns">
        <CardHeader>
          <div className="flex items-start justify-between gap-2 flex-wrap gap-y-2">
            <div>
              <CardTitle>Returns by Investment Cohort</CardTitle>
              <CardDescription>
                {viewMode === "chart"
                  ? `Each line represents assets acquired in the same month. X-axis shows ${xLabel}.`
                  : `Rows = investment cohort month · Columns = ${xLabel} · Click a row to view individual assets`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {granularityToggle}
              {viewToggle}
              {viewMode === "chart" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setChartExpanded(e => !e)}
                  data-testid="button-toggle-cohort-chart-height"
                  title={chartExpanded ? "Collapse chart" : "Expand chart"}
                  aria-label={chartExpanded ? "Collapse chart" : "Expand chart"}
                >
                  {chartExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "chart" ? (
            <ResponsiveContainer width="100%" height={chartExpanded ? 600 : 350}>
              <LineChart data={chartData} margin={{ top: 20, right: 30, bottom: 60, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="calendarLabel"
                  className="text-xs fill-muted-foreground"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  interval={0}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  className="text-xs fill-muted-foreground"
                  tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}%`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const calendarMonth = chartData.find(d => d.calendarLabel === label)?.calendarMonth as string;
                    return (
                      <div className="bg-popover border rounded-lg p-3 shadow-lg">
                        <p className="font-medium mb-2">{label}</p>
                        <div className="space-y-1 text-sm">
                          {payload.map((entry, idx) => {
                            const cohortLabel = entry.name as string;
                            const count = cohortInfoMap.get(cohortLabel)?.get(calendarMonth) || 0;
                            return (
                              <div key={idx} className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span>{cohortLabel}:</span>
                                <span className="font-medium">
                                  {(entry.value as number) >= 0 ? '+' : ''}{(entry.value as number).toFixed(2)}%
                                </span>
                                {count > 0 && (
                                  <span className="text-muted-foreground text-xs">({count} valuations)</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }}
                />
                {cohortData.map((cohort, idx) => (
                  <Line
                    key={cohort.cohortKey}
                    type="monotone"
                    dataKey={cohort.cohortLabel}
                    stroke={COLORS[idx % COLORS.length]}
                    strokeWidth={3.5}
                    dot={{ fill: COLORS[idx % COLORS.length], r: 4, strokeWidth: 0 }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div>
              <div className="overflow-x-auto" data-testid="cohort-table">
                <table className="w-full text-xs border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-card text-left font-medium text-muted-foreground py-2 pr-4 pl-1 whitespace-nowrap border-b">
                        Cohort
                        <span className="ml-1 font-normal text-[10px] text-muted-foreground/60"># assets</span>
                      </th>
                      {allMonths.map(period => (
                        <th
                          key={period}
                          className="text-center font-medium text-muted-foreground py-2 px-2 whitespace-nowrap border-b min-w-[72px]"
                          data-testid={`th-month-${period}`}
                        >
                          {monthLabels.get(period) || period}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohortData.map((cohort, idx) => {
                      const color = COLORS[idx % COLORS.length];
                      const isSelected = selectedCohort?.cohortKey === cohort.cohortKey;
                      const dataMap: Map<string, number> = granularity === "month"
                        ? new Map(cohort.data.map(d => [d.calendarMonth, d.avgReturn]))
                        : new Map(
                            (allMonths
                              .map(qKey => {
                                const monthsInQ = cohort.data.filter(d => monthToQuarterKey(d.calendarMonth) === qKey);
                                const vals = monthsInQ.map(d => d.avgReturn);
                                if (vals.length === 0) return null;
                                return [qKey, vals.reduce((a, b) => a + b, 0) / vals.length] as [string, number];
                              })
                              .filter((x): x is [string, number] => x !== null))
                          );
                      return (
                        <tr
                          key={cohort.cohortKey}
                          className={`cursor-pointer transition-all ${isSelected ? "ring-1 ring-inset ring-primary/30 bg-primary/5" : "hover:brightness-95"}`}
                          onClick={() => setSelectedCohort(cohort)}
                          data-testid={`row-cohort-${cohort.cohortKey}`}
                        >
                          <td className="sticky left-0 z-10 bg-card py-2 pr-4 pl-1 whitespace-nowrap border-b border-muted/40">
                            <div className="flex items-center gap-1.5">
                              <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 transition-colors ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="font-medium text-foreground">{cohort.cohortLabel}</span>
                              <span
                                className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums"
                                data-testid={`badge-cohort-count-${cohort.cohortKey}`}
                              >
                                {cohort.data[cohort.data.length - 1]?.assetCount ?? 0}
                              </span>
                            </div>
                          </td>
                          {allMonths.map(period => {
                            const val = dataMap.get(period);
                            return (
                              <td
                                key={period}
                                className="text-center py-2 px-2 border-b border-muted/40 tabular-nums font-medium text-foreground transition-colors"
                                style={getHeatmapStyle(val, maxAbs)}
                                data-testid={`cell-${cohort.cohortKey}-${period}`}
                              >
                                {fmtReturn(val)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground" data-testid="heatmap-legend">
                <span className="font-medium">Color scale:</span>
                <div className="flex items-center gap-1">
                  <div className="w-16 h-3 rounded-sm" style={{ background: "linear-gradient(to right, rgba(239,68,68,0.65), rgba(239,68,68,0.1))" }} />
                  <span>Large loss → Small loss</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-16 h-3 rounded-sm" style={{ background: "linear-gradient(to right, rgba(16,185,129,0.1), rgba(16,185,129,0.65))" }} />
                  <span>Small gain → Large gain</span>
                </div>
                <span className="ml-1 opacity-70">Intensity ∝ return vs. max ({maxAbs > 0 ? `${maxAbs.toFixed(1)}%` : "—"})</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CohortDetailSheet
        cohort={selectedCohort}
        platformId={platformId}
        statusFilter={statusFilter}
        rawMonths={rawMonths}
        rawMonthLabels={rawMonthLabels}
        maxAbs={maxAbs}
        open={selectedCohort !== null}
        onClose={() => setSelectedCohort(null)}
      />
    </div>
  );
}
