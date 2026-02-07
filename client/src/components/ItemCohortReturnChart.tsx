import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useMemo } from "react";

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

export function ItemCohortReturnChart({ platformId, statusFilter = "all" }: ItemCohortReturnChartProps) {
  const { data: cohortData, isLoading } = useQuery<CohortData[]>({
    queryKey: ['/api/platforms', platformId, 'item-cohort-returns', statusFilter],
    queryFn: async () => {
      const url = `/api/platforms/${platformId}/item-cohort-returns?statusFilter=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cohort data");
      return await res.json();
    }
  });

  const { chartData, allMonths, cohortInfoMap } = useMemo(() => {
    if (!cohortData || cohortData.length === 0) {
      return { chartData: [], allMonths: [], cohortInfoMap: new Map<string, Map<string, number>>() };
    }

    // Collect all unique calendar months across all cohorts
    const monthSet = new Set<string>();
    const monthLabels = new Map<string, string>();
    const infoMap = new Map<string, Map<string, number>>();

    cohortData.forEach(cohort => {
      infoMap.set(cohort.cohortLabel, new Map());
      cohort.data.forEach(d => {
        monthSet.add(d.calendarMonth);
        monthLabels.set(d.calendarMonth, d.calendarLabel);
        infoMap.get(cohort.cohortLabel)!.set(d.calendarMonth, d.assetCount);
      });
    });

    // Sort months chronologically
    const sortedMonths = Array.from(monthSet).sort();

    // Build chart data: one row per calendar month with each cohort's value
    const data = sortedMonths.map(month => {
      const row: Record<string, string | number | undefined> = { 
        calendarMonth: month,
        calendarLabel: monthLabels.get(month) || month
      };
      cohortData.forEach(cohort => {
        const point = cohort.data.find(d => d.calendarMonth === month);
        if (point) {
          row[cohort.cohortLabel] = point.avgReturn;
        }
      });
      return row;
    });

    return { chartData: data, allMonths: sortedMonths, cohortInfoMap: infoMap };
  }, [cohortData]);

  if (isLoading) {
    return (
      <Card data-testid="card-item-cohort-returns">
        <CardHeader>
          <CardTitle>Returns by Investment Cohort</CardTitle>
          <CardDescription>Loading chart data...</CardDescription>
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
        <CardTitle>Returns by Investment Cohort</CardTitle>
        <CardDescription>Each line represents assets acquired in the same month. X-axis shows calendar months.</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
