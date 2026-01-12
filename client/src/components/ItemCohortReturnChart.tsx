import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useMemo } from "react";

interface CohortData {
  cohort: number;
  cohortLabel: string;
  data: { month: number; avgReturn: number; assetCount: number }[];
}

interface ItemCohortReturnChartProps {
  platformId: number;
}

const COLORS = [
  "#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#00C49F", 
  "#FFBB28", "#FF8042", "#0088FE", "#a4de6c", "#d0ed57"
];

export function ItemCohortReturnChart({ platformId }: ItemCohortReturnChartProps) {
  const { data: cohortData, isLoading } = useQuery<CohortData[]>({
    queryKey: ['/api/platforms', platformId, 'item-cohort-returns'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${platformId}/item-cohort-returns`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cohort data");
      return await res.json();
    }
  });

  const { chartData, maxMonth } = useMemo(() => {
    if (!cohortData || cohortData.length === 0) {
      return { chartData: [], maxMonth: 0 };
    }

    // Create a single data point array with each cohort's data as a separate key
    // Format: [{ month: 1, "Month 6": 5.2, "Month 12": 8.4, ... }, ...]
    const monthMap = new Map<number, Record<string, number | null>>();
    let max = 0;

    cohortData.forEach(cohort => {
      if (cohort.cohort > max) max = cohort.cohort;
      cohort.data.forEach(d => {
        if (!monthMap.has(d.month)) {
          monthMap.set(d.month, { month: d.month });
        }
        monthMap.get(d.month)![cohort.cohortLabel] = d.avgReturn;
      });
    });

    // Convert map to array and sort by month
    const data = Array.from(monthMap.values()).sort((a, b) => (a.month as number) - (b.month as number));

    return { chartData: data, maxMonth: max };
  }, [cohortData]);

  if (isLoading) {
    return (
      <Card data-testid="card-item-cohort-returns">
        <CardHeader>
          <CardTitle>Returns by Investment Month</CardTitle>
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
          <CardTitle>Returns by Investment Month</CardTitle>
          <CardDescription>Average return grouped by months since investment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No data available yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-item-cohort-returns">
      <CardHeader>
        <CardTitle>Returns by Investment Month</CardTitle>
        <CardDescription>Average return % for assets grouped by months since investment. Each bar represents a cohort of assets invested X months ago.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData} margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="month"
              type="number"
              domain={[0, maxMonth + 1]}
              tickFormatter={(val) => `${val}m`}
              className="text-xs fill-muted-foreground"
              label={{ value: 'Months since investment', position: 'insideBottom', offset: -15, className: 'fill-muted-foreground text-xs' }}
            />
            <YAxis 
              className="text-xs fill-muted-foreground"
              tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}%`}
            />
            <Tooltip 
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                return (
                  <div className="bg-popover border rounded-lg p-3 shadow-lg">
                    <p className="font-medium mb-2">Month {label} Cohorts</p>
                    <div className="space-y-1 text-sm">
                      {payload.map((entry, idx) => (
                        <p key={idx} style={{ color: entry.color }}>
                          {entry.name}: {(entry.value as number) >= 0 ? '+' : ''}{entry.value}%
                        </p>
                      ))}
                    </div>
                  </div>
                );
              }}
            />
            <Legend />
            {cohortData.map((cohort, idx) => (
              <Line
                key={cohort.cohort}
                type="monotone"
                dataKey={cohort.cohortLabel}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={2}
                dot={{ fill: COLORS[idx % COLORS.length], r: 4 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
