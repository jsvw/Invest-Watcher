import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useMemo } from "react";

interface CohortData {
  cohortKey: string;
  cohortLabel: string;
  data: { monthIndex: number; avgReturn: number; assetCount: number }[];
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

  const { chartData, maxMonth, cohortInfoMap } = useMemo(() => {
    if (!cohortData || cohortData.length === 0) {
      return { chartData: [], maxMonth: 0, cohortInfoMap: new Map<string, Map<number, number>>() };
    }

    const monthMap = new Map<number, Record<string, number | undefined>>();
    const infoMap = new Map<string, Map<number, number>>();
    let max = 0;

    cohortData.forEach(cohort => {
      infoMap.set(cohort.cohortLabel, new Map());
      cohort.data.forEach(d => {
        if (d.monthIndex > max) max = d.monthIndex;
        if (!monthMap.has(d.monthIndex)) {
          monthMap.set(d.monthIndex, { monthIndex: d.monthIndex });
        }
        monthMap.get(d.monthIndex)![cohort.cohortLabel] = d.avgReturn;
        infoMap.get(cohort.cohortLabel)!.set(d.monthIndex, d.assetCount);
      });
    });

    const data = Array.from(monthMap.values()).sort((a, b) => (a.monthIndex as number) - (b.monthIndex as number));

    return { chartData: data, maxMonth: max, cohortInfoMap: infoMap };
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
        <CardDescription>Each line represents assets acquired in the same month. X-axis shows months since investment.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData} margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="monthIndex"
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
                const monthIdx = Number(label);
                return (
                  <div className="bg-popover border rounded-lg p-3 shadow-lg">
                    <p className="font-medium mb-2">At Month {monthIdx}</p>
                    <div className="space-y-1 text-sm">
                      {payload.map((entry, idx) => {
                        const cohortLabel = entry.name as string;
                        const count = cohortInfoMap.get(cohortLabel)?.get(monthIdx) || 0;
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
            <Legend />
            {cohortData.map((cohort, idx) => (
              <Line
                key={cohort.cohortKey}
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
