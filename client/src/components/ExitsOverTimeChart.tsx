import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from "recharts";
import { formatCurrency, formatCompactCurrency } from "@/lib/currency";
import { format, parse, addMonths } from "date-fns";

interface ExitMonth {
  month: string;
  invested: number;
  profit: number;
  count: number;
}

interface ChartEntry extends ExitMonth {
  label: string;
  cumulativeProfit: number;
}

interface ExitsOverTimeChartProps {
  platformId: number;
  currency: string;
}

export function ExitsOverTimeChart({ platformId, currency }: ExitsOverTimeChartProps) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<ExitMonth[]>({
    queryKey: ['/api/platforms', platformId, 'exits-over-time'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${platformId}/exits-over-time`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch exits data");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="card-exits-over-time">
        <CardHeader>
          <CardTitle>Exits Over Time</CardTitle>
          <CardDescription>Loading exit data…</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card data-testid="card-exits-over-time">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Exits Over Time</CardTitle>
            <CardDescription>Monthly view of capital returned and profit realised</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(e => !e)}
            data-testid="button-toggle-exits-chart-height"
            title={expanded ? "Collapse chart" : "Expand chart"}
            aria-label={expanded ? "Collapse chart" : "Expand chart"}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            No exited investments yet. Exit an asset to see it here.
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalInvested = data.reduce((s, d) => s + d.invested, 0);
  const totalProfit = data.reduce((s, d) => s + d.profit, 0);
  const totalExits = data.reduce((s, d) => s + d.count, 0);

  // Build a complete month range so every month shows, even those with no exits
  const parseMonth = (m: string) => parse(m + "-01", "yyyy-MM-dd", new Date(2000, 0, 1));
  const exitsByMonth = new Map(data.map(d => [d.month, d]));
  const firstMonth = parseMonth(data[0].month);
  const lastMonth = parseMonth(data[data.length - 1].month);
  const chartData: ChartEntry[] = [];
  let cursor = firstMonth;
  let runningProfit = 0;
  while (cursor <= lastMonth) {
    const key = format(cursor, "yyyy-MM");
    const entry = exitsByMonth.get(key);
    runningProfit += entry?.profit ?? 0;
    chartData.push({
      month: key,
      invested: entry?.invested ?? 0,
      profit: entry?.profit ?? 0,
      count: entry?.count ?? 0,
      label: format(cursor, "MMM yy"),
      cumulativeProfit: runningProfit,
    });
    cursor = addMonths(cursor, 1);
  }

  // Determine whether the cumulative scale differs enough to warrant a right axis.
  // We always use a right axis to keep bars readable alongside the line.
  const maxBarValue = Math.max(...chartData.map(d => d.invested + Math.max(d.profit, 0)));
  const maxCumulative = Math.max(...chartData.map(d => Math.abs(d.cumulativeProfit)));
  const needsRightAxis = maxCumulative > maxBarValue * 1.5 || maxCumulative < maxBarValue * 0.2;

  return (
    <Card data-testid="card-exits-over-time">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Exits Over Time</CardTitle>
          <CardDescription>
            {totalExits} exit{totalExits !== 1 ? "s" : ""} · capital returned {formatCurrency(totalInvested, currency)} · profit {totalProfit >= 0 ? "+" : ""}{formatCurrency(totalProfit, currency)}
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(e => !e)}
          data-testid="button-toggle-exits-chart-height"
          title={expanded ? "Collapse chart" : "Expand chart"}
          aria-label={expanded ? "Collapse chart" : "Expand chart"}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={expanded ? 550 : 300}>
          <ComposedChart data={chartData} margin={{ top: 10, right: needsRightAxis ? 75 : 20, bottom: 20, left: 20 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground text-xs"
            />
            <YAxis
              yAxisId="bars"
              tickFormatter={(v) => formatCompactCurrency(v, currency)}
              className="fill-muted-foreground text-xs"
              width={70}
            />
            {needsRightAxis && (
              <YAxis
                yAxisId="cumulative"
                orientation="right"
                tickFormatter={(v) => formatCompactCurrency(v, currency)}
                className="fill-muted-foreground text-xs"
                width={70}
              />
            )}
            <ReferenceLine yAxisId="bars" y={0} stroke="hsl(var(--border))" />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload as ChartEntry;
                return (
                  <div className="bg-popover border rounded-lg p-3 shadow-lg text-sm min-w-[220px]">
                    <p className="font-semibold mb-2">{label}</p>
                    <div className="space-y-1">
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">Exits</span>
                        <span className="font-medium">{d.count}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">Capital returned</span>
                        <span className="font-medium">{formatCurrency(d.invested, currency)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">Monthly profit / loss</span>
                        <span className={`font-medium ${d.profit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {d.profit >= 0 ? "+" : ""}{formatCurrency(d.profit, currency)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground">Total received</span>
                        <span className="font-medium">{formatCurrency(d.invested + d.profit, currency)}</span>
                      </div>
                      <div className="flex justify-between gap-6 border-t pt-1 mt-1">
                        <span className="text-muted-foreground">Cumulative profit</span>
                        <span className={`font-medium ${d.cumulativeProfit >= 0 ? "text-violet-500" : "text-red-500"}`}>
                          {d.cumulativeProfit >= 0 ? "+" : ""}{formatCurrency(d.cumulativeProfit, currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Bar yAxisId="bars" dataKey="invested" name="Capital returned" stackId="a" fill="hsl(var(--primary))" fillOpacity={0.7} radius={[0, 0, 3, 3]} />
            <Bar
              yAxisId="bars"
              dataKey="profit"
              name="Monthly profit / loss"
              stackId="a"
              radius={[3, 3, 0, 0]}
              label={({ x, y, width, index }: { x: number; y: number; width: number; index: number }) => {
                const count = chartData[index]?.count;
                if (!count) return <g />;
                return (
                  <text
                    x={x + width / 2}
                    y={y - 5}
                    textAnchor="middle"
                    fontSize={11}
                    className="fill-muted-foreground"
                    fontWeight={500}
                  >
                    {count}
                  </text>
                );
              }}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`profit-cell-${index}`}
                  fill={entry.profit >= 0 ? "#10b981" : "#ef4444"}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
            <Line
              yAxisId={needsRightAxis ? "cumulative" : "bars"}
              type="monotone"
              dataKey="cumulativeProfit"
              name="Cumulative profit"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#8b5cf6" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(var(--primary))", opacity: 0.7 }} />
            Capital returned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" style={{ opacity: 0.85 }} />
            Profit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-500" style={{ opacity: 0.85 }} />
            Loss
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm bg-violet-500" style={{ opacity: 1 }} />
            Cumulative profit
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
