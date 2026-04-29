import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useMemo, useState, Fragment } from "react";
import type { CSSProperties } from "react";
import { BarChart2, Table2, ChevronRight, ChevronDown } from "lucide-react";

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

interface CohortAssetRowsProps {
  platformId: number;
  cohortKey: string;
  statusFilter: string;
  allMonths: string[];
  granularity: "month" | "quarter";
  maxAbs: number;
}

function CohortAssetRows({ platformId, cohortKey, statusFilter, allMonths, granularity, maxAbs }: CohortAssetRowsProps) {
  const { data, isLoading } = useQuery<AssetRow[]>({
    queryKey: ['/api/platforms', platformId, 'item-cohort-assets', cohortKey, statusFilter],
    queryFn: async () => {
      const url = `/api/platforms/${platformId}/item-cohort-assets?cohortKey=${cohortKey}&statusFilter=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch asset data");
      return res.json();
    }
  });

  const numCols = allMonths.length + 1;

  if (isLoading) {
    return (
      <tr data-testid={`asset-rows-loading-${cohortKey}`}>
        <td colSpan={numCols} className="py-2 pl-8 pr-4 border-b border-muted/30">
          <Skeleton className="h-5 w-full" />
        </td>
      </tr>
    );
  }

  if (!data || data.length === 0) {
    return (
      <tr>
        <td colSpan={numCols} className="py-2 pl-8 text-xs text-muted-foreground italic border-b border-muted/30">
          No individual asset data available.
        </td>
      </tr>
    );
  }

  return (
    <>
      {data.map(asset => {
        const dataMap: Map<string, number> = granularity === "month"
          ? new Map(asset.data.map(d => [d.calendarMonth, d.returnPct]))
          : new Map(
              (allMonths
                .map(qKey => {
                  const monthsInQ = asset.data.filter(d => monthToQuarterKey(d.calendarMonth) === qKey);
                  const vals = monthsInQ.map(d => d.returnPct);
                  if (vals.length === 0) return null;
                  return [qKey, vals.reduce((a, b) => a + b, 0) / vals.length] as [string, number];
                })
                .filter((x): x is [string, number] => x !== null))
            );

        return (
          <tr key={asset.assetId} className="bg-muted/20" data-testid={`asset-row-${asset.assetId}`}>
            <td className="sticky left-0 z-10 bg-muted/20 py-1.5 pr-4 pl-7 whitespace-nowrap border-b border-muted/30">
              <div className="flex items-center gap-2">
                <div className="w-px h-3.5 bg-border flex-shrink-0" />
                <span className="text-foreground text-xs truncate max-w-[150px]" title={asset.assetName}>
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
            {allMonths.map(period => {
              const val = dataMap.get(period);
              return (
                <td
                  key={period}
                  className="text-center py-1.5 px-2 border-b border-muted/30 tabular-nums text-xs text-foreground"
                  style={getHeatmapStyle(val, maxAbs)}
                  data-testid={`asset-cell-${asset.assetId}-${period}`}
                >
                  {fmtReturn(val)}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

export function ItemCohortReturnChart({ platformId, statusFilter = "all" }: ItemCohortReturnChartProps) {
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const [granularity, setGranularity] = useState<"month" | "quarter">("month");
  const [expandedCohorts, setExpandedCohorts] = useState<Set<string>>(new Set());

  const { data: cohortData, isLoading } = useQuery<CohortData[]>({
    queryKey: ['/api/platforms', platformId, 'item-cohort-returns', statusFilter],
    queryFn: async () => {
      const url = `/api/platforms/${platformId}/item-cohort-returns?statusFilter=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cohort data");
      return await res.json();
    }
  });

  const { chartData, allMonths, monthLabels, cohortInfoMap } = useMemo(() => {
    const empty = { chartData: [], allMonths: [], monthLabels: new Map<string, string>(), cohortInfoMap: new Map<string, Map<string, number>>() };
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
      return { chartData: data, allMonths: sortedMonths, monthLabels: lblMap, cohortInfoMap: infoMap };
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

    return { chartData: data, allMonths: sortedQuarters, monthLabels: qLblMap, cohortInfoMap: qInfoMap };
  }, [cohortData, granularity]);

  function toggleCohort(cohortKey: string) {
    setExpandedCohorts(prev => {
      const next = new Set(prev);
      if (next.has(cohortKey)) next.delete(cohortKey);
      else next.add(cohortKey);
      return next;
    });
  }

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

  return (
    <Card data-testid="card-item-cohort-returns">
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap gap-y-2">
          <div>
            <CardTitle>Returns by Investment Cohort</CardTitle>
            <CardDescription>
              {viewMode === "chart"
                ? `Each line represents assets acquired in the same month. X-axis shows ${xLabel}.`
                : `Rows = investment cohort month · Columns = ${xLabel} · Click a row to expand individual assets`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {granularityToggle}
            {viewToggle}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === "chart" ? (
          <ResponsiveContainer width="100%" height={350}>
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
          (() => {
            const maxAbs = cohortData.reduce((m, cohort) =>
              cohort.data.reduce((m2, d) => Math.max(m2, Math.abs(d.avgReturn)), m), 0
            );
            return (
              <div>
                <div className="overflow-x-auto" data-testid="cohort-table">
                  <table className="w-full text-xs border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-card text-left font-medium text-muted-foreground py-2 pr-4 pl-1 whitespace-nowrap border-b">
                          Cohort
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
                        const isExpanded = expandedCohorts.has(cohort.cohortKey);
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
                          <Fragment key={cohort.cohortKey}>
                            <tr
                              className="cursor-pointer hover:brightness-95 transition-all"
                              onClick={() => toggleCohort(cohort.cohortKey)}
                              data-testid={`row-cohort-${cohort.cohortKey}`}
                            >
                              <td className="sticky left-0 z-10 bg-card py-2 pr-4 pl-1 whitespace-nowrap border-b border-muted/40">
                                <div className="flex items-center gap-1.5">
                                  {isExpanded
                                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  }
                                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                  <span className="font-medium text-foreground">{cohort.cohortLabel}</span>
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
                            {isExpanded && (
                              <CohortAssetRows
                                platformId={platformId}
                                cohortKey={cohort.cohortKey}
                                statusFilter={statusFilter}
                                allMonths={allMonths}
                                granularity={granularity}
                                maxAbs={maxAbs}
                              />
                            )}
                          </Fragment>
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
            );
          })()
        )}
      </CardContent>
    </Card>
  );
}
