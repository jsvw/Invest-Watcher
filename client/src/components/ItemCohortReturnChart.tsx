import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useMemo, useState } from "react";
import { BarChart2, Table2 } from "lucide-react";

interface CohortData {
  cohortKey: string;
  cohortLabel: string;
  data: { calendarMonth: string; calendarLabel: string; avgReturn: number; assetCount: number }[];
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

export function ItemCohortReturnChart({ platformId, statusFilter = "all" }: ItemCohortReturnChartProps) {
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");

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
    if (!cohortData || cohortData.length === 0) {
      return { chartData: [], allMonths: [], monthLabels: new Map<string, string>(), cohortInfoMap: new Map<string, Map<string, number>>() };
    }

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
  }, [cohortData]);

  const toggleBar = (
    <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/50">
      <button
        data-testid="btn-cohort-view-chart"
        onClick={() => setViewMode("chart")}
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          viewMode === "chart"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <BarChart2 className="h-3.5 w-3.5" />
        Chart
      </button>
      <button
        data-testid="btn-cohort-view-table"
        onClick={() => setViewMode("table")}
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          viewMode === "table"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Table2 className="h-3.5 w-3.5" />
        Table
      </button>
    </div>
  );

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
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
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
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Returns by Investment Cohort</CardTitle>
            <CardDescription>
              {viewMode === "chart"
                ? "Each line represents assets acquired in the same month. X-axis shows calendar months."
                : "Rows = investment cohort month · Columns = calendar month · Values = average return"}
            </CardDescription>
          </div>
          {toggleBar}
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
                                {(entry.value as number) >= 0 ? '+' : ''}{entry.value}%
                              </span>
                              <span className="text-muted-foreground text-xs">({count} valuations)</span>
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
          <div className="overflow-x-auto" data-testid="cohort-table">
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card text-left font-medium text-muted-foreground py-2 pr-4 pl-1 whitespace-nowrap border-b">
                    Cohort
                  </th>
                  {allMonths.map(month => (
                    <th
                      key={month}
                      className="text-center font-medium text-muted-foreground py-2 px-2 whitespace-nowrap border-b min-w-[72px]"
                      data-testid={`th-month-${month}`}
                    >
                      {monthLabels.get(month) || month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohortData.map((cohort, idx) => {
                  const color = COLORS[idx % COLORS.length];
                  const dataMap = new Map(cohort.data.map(d => [d.calendarMonth, d.avgReturn]));
                  return (
                    <tr
                      key={cohort.cohortKey}
                      className="hover:bg-muted/40 transition-colors"
                      data-testid={`row-cohort-${cohort.cohortKey}`}
                    >
                      <td className="sticky left-0 z-10 bg-card py-2 pr-4 pl-1 whitespace-nowrap border-b border-muted/40">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="font-medium text-foreground">{cohort.cohortLabel}</span>
                        </div>
                      </td>
                      {allMonths.map(month => {
                        const val = dataMap.get(month);
                        const formatted = fmtReturn(val);
                        const isPositive = val !== undefined && val > 0;
                        const isNegative = val !== undefined && val < 0;
                        return (
                          <td
                            key={month}
                            className={`text-center py-2 px-2 border-b border-muted/40 tabular-nums ${
                              isPositive ? "text-emerald-600 dark:text-emerald-400" :
                              isNegative ? "text-red-500 dark:text-red-400" :
                              "text-muted-foreground"
                            }`}
                            data-testid={`cell-${cohort.cohortKey}-${month}`}
                          >
                            {formatted}
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
      </CardContent>
    </Card>
  );
}
