import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCompactCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Granularity = "year" | "quarter" | "month";
type ViewMode = "combined" | "platform";

interface PlatformBreakdown {
  platformId: number;
  name: string;
  color: string;
  netInvested: number;
  valueChange: number;
}

interface WaterfallPeriod {
  period: string;
  openValue: number;
  netInvested: number;
  valueChange: number;
  closeValue: number;
  platformBreakdown: PlatformBreakdown[];
}

interface WaterfallChartProps {
  currency: string;
  excludedPlatforms: Set<number>;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatPeriodLabel(period: string, granularity: Granularity): string {
  if (granularity === "year") return period;
  if (granularity === "quarter") {
    const [y, q] = period.split("-");
    return `${q} '${y.slice(2)}`;
  }
  const [y, m] = period.split("-");
  return `${MONTHS[parseInt(m) - 1]} '${y.slice(2)}`;
}

const OPEN_COLOR = "#94a3b8";
const COMBINED_INVEST_COLOR = "#3b82f6";
const COMBINED_WITHDRAW_COLOR = "#f97316";
const COMBINED_GAIN_COLOR = "#10b981";
const COMBINED_LOSS_COLOR = "#ef4444";
const CLOSE_COLOR = "#64748b";

// Each period is expanded into 4 sub-entries: open, invest, value, close
// We create synthetic X-axis labels so each sub-entry appears as its own column.
// A "group" field ties them back to the original period for tooltip purposes.
interface ChartRow {
  xLabel: string;
  subType: "open" | "invest" | "value" | "close";
  period: string;
  periodLabel: string;
  openValue: number;
  netInvested: number;
  valueChange: number;
  closeValue: number;
  // bar fields
  connector: number;
  connector_neg: number;
  [key: string]: any;
}

export function WaterfallChart({ currency, excludedPlatforms }: WaterfallChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [viewMode, setViewMode] = useState<ViewMode>("combined");

  const excludeParam = excludedPlatforms.size > 0
    ? `&excludePlatforms=${Array.from(excludedPlatforms).join(",")}`
    : "";

  const { data: waterfallData, isLoading } = useQuery<WaterfallPeriod[]>({
    queryKey: ["/api/portfolio/waterfall", granularity, Array.from(excludedPlatforms).sort().join(",")],
    queryFn: async () => {
      const res = await fetch(
        `/api/portfolio/waterfall?granularity=${granularity}${excludeParam}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch waterfall data");
      return res.json();
    },
  });

  const allPlatforms = useMemo(() => {
    if (!waterfallData) return [];
    const map = new Map<number, { name: string; color: string }>();
    for (const period of waterfallData) {
      for (const pb of period.platformBreakdown) {
        map.set(pb.platformId, { name: pb.name, color: pb.color });
      }
    }
    return Array.from(map.entries()).map(([id, info]) => ({ id, ...info }));
  }, [waterfallData]);

  // Build flat chart rows: 4 rows per period (open, invest, value, close)
  const chartData = useMemo(() => {
    if (!waterfallData) return [];
    const rows: ChartRow[] = [];

    for (const period of waterfallData) {
      const periodLabel = formatPeriodLabel(period.period, granularity);
      const { openValue, netInvested, valueChange, closeValue, platformBreakdown } = period;

      const baseRow = {
        period: period.period,
        periodLabel,
        openValue,
        netInvested,
        valueChange,
        closeValue,
      };

      // --- Open bar ---
      rows.push({
        ...baseRow,
        xLabel: `${periodLabel}|open`,
        subType: "open",
        connector: 0,
        connector_neg: 0,
        bar_pos: openValue >= 0 ? openValue : 0,
        bar_neg: openValue < 0 ? openValue : 0,
      });

      // --- Net Invested bar (floats from openValue) ---
      const investBase = openValue;
      if (viewMode === "combined") {
        rows.push({
          ...baseRow,
          xLabel: `${periodLabel}|invest`,
          subType: "invest",
          connector: investBase >= 0 ? investBase : 0,
          connector_neg: investBase < 0 ? investBase : 0,
          bar_pos: netInvested >= 0 ? netInvested : 0,
          bar_neg: netInvested < 0 ? netInvested : 0,
        });
      } else {
        const investRow: ChartRow = {
          ...baseRow,
          xLabel: `${periodLabel}|invest`,
          subType: "invest",
          connector: investBase >= 0 ? investBase : 0,
          connector_neg: investBase < 0 ? investBase : 0,
          bar_pos: 0,
          bar_neg: 0,
        };
        for (const pb of platformBreakdown) {
          investRow[`p_pos_${pb.platformId}`] = pb.netInvested >= 0 ? pb.netInvested : 0;
          investRow[`p_neg_${pb.platformId}`] = pb.netInvested < 0 ? pb.netInvested : 0;
        }
        rows.push(investRow);
      }

      // --- Value Change bar (floats from openValue + netInvested) ---
      const valueBase = openValue + netInvested;
      if (viewMode === "combined") {
        rows.push({
          ...baseRow,
          xLabel: `${periodLabel}|value`,
          subType: "value",
          connector: valueBase >= 0 ? valueBase : 0,
          connector_neg: valueBase < 0 ? valueBase : 0,
          bar_pos: valueChange >= 0 ? valueChange : 0,
          bar_neg: valueChange < 0 ? valueChange : 0,
        });
      } else {
        const valueRow: ChartRow = {
          ...baseRow,
          xLabel: `${periodLabel}|value`,
          subType: "value",
          connector: valueBase >= 0 ? valueBase : 0,
          connector_neg: valueBase < 0 ? valueBase : 0,
          bar_pos: 0,
          bar_neg: 0,
        };
        for (const pb of platformBreakdown) {
          valueRow[`p_pos_${pb.platformId}`] = pb.valueChange >= 0 ? pb.valueChange : 0;
          valueRow[`p_neg_${pb.platformId}`] = pb.valueChange < 0 ? pb.valueChange : 0;
        }
        rows.push(valueRow);
      }

      // --- Close bar ---
      rows.push({
        ...baseRow,
        xLabel: `${periodLabel}|close`,
        subType: "close",
        connector: 0,
        connector_neg: 0,
        bar_pos: closeValue >= 0 ? closeValue : 0,
        bar_neg: closeValue < 0 ? closeValue : 0,
      });
    }

    return rows;
  }, [waterfallData, viewMode, granularity]);

  const granularityBtns: { key: Granularity; label: string }[] = [
    { key: "year", label: "Year" },
    { key: "quarter", label: "Quarter" },
    { key: "month", label: "Month" },
  ];

  const viewModeBtns: { key: ViewMode; label: string }[] = [
    { key: "combined", label: "Combined" },
    { key: "platform", label: "By Platform" },
  ];

  // Custom tick that shows only the period label (not the sub-type suffix)
  const CustomXAxisTick = ({ x, y, payload }: any) => {
    const label: string = payload?.value ?? "";
    const [periodLabel, subType] = label.split("|");
    // Only show label on the "invest" sub-column (middle-ish)
    if (subType !== "invest") return null;
    return (
      <text x={x} y={y + 12} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={10}>
        {periodLabel}
      </text>
    );
  };

  const customTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const row = chartData.find(d => d.xLabel === label);
    if (!row) return null;

    const periodData = waterfallData?.find(p => p.period === row.period);
    const subType = row.subType;

    const subLabel: Record<string, string> = {
      open: "Opening Value",
      invest: "Net Invested",
      value: "Value Change",
      close: "Closing Value",
    };

    const subValue: Record<string, number> = {
      open: row.openValue,
      invest: row.netInvested,
      value: row.valueChange,
      close: row.closeValue,
    };

    const subColor: Record<string, string> = {
      open: OPEN_COLOR,
      invest: row.netInvested >= 0 ? COMBINED_INVEST_COLOR : COMBINED_WITHDRAW_COLOR,
      value: row.valueChange >= 0 ? COMBINED_GAIN_COLOR : COMBINED_LOSS_COLOR,
      close: CLOSE_COLOR,
    };

    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs min-w-[180px]">
        <p className="font-semibold mb-1">{row.periodLabel}</p>
        <p className="text-muted-foreground mb-2">{subLabel[subType]}</p>
        <p className="font-bold text-sm" style={{ color: subColor[subType] }}>
          {subType === "invest" || subType === "value"
            ? (subValue[subType] >= 0 ? "+" : "") + formatCurrency(subValue[subType], currency)
            : formatCurrency(subValue[subType], currency)}
        </p>
        <div className="border-t mt-2 pt-2 space-y-0.5">
          <div className="flex justify-between gap-3 text-muted-foreground">
            <span>Open</span><span>{formatCurrency(row.openValue, currency)}</span>
          </div>
          <div className="flex justify-between gap-3 text-muted-foreground">
            <span>Invested</span>
            <span className={row.netInvested >= 0 ? "text-blue-500" : "text-orange-500"}>
              {row.netInvested >= 0 ? "+" : ""}{formatCurrency(row.netInvested, currency)}
            </span>
          </div>
          <div className="flex justify-between gap-3 text-muted-foreground">
            <span>Value Δ</span>
            <span className={row.valueChange >= 0 ? "text-emerald-500" : "text-red-500"}>
              {row.valueChange >= 0 ? "+" : ""}{formatCurrency(row.valueChange, currency)}
            </span>
          </div>
          <div className="flex justify-between gap-3 font-semibold">
            <span>Close</span><span>{formatCurrency(row.closeValue, currency)}</span>
          </div>
        </div>
        {viewMode === "platform" && periodData?.platformBreakdown.length ? (
          <div className="border-t pt-2 mt-2 space-y-1.5">
            {periodData.platformBreakdown.map(pb =>
              (Math.abs(pb.netInvested) > 0.01 || Math.abs(pb.valueChange) > 0.01) && (
                <div key={pb.platformId}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pb.color }} />
                    <span className="text-muted-foreground font-medium">{pb.name}</span>
                  </div>
                  <div className="ml-3.5 grid grid-cols-2 gap-x-2 text-[11px]">
                    <span className="text-muted-foreground">Invested</span>
                    <span className={cn("text-right", pb.netInvested >= 0 ? "text-blue-500" : "text-orange-500")}>
                      {pb.netInvested >= 0 ? "+" : ""}{formatCurrency(pb.netInvested, currency)}
                    </span>
                    <span className="text-muted-foreground">Value Δ</span>
                    <span className={cn("text-right", pb.valueChange >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {pb.valueChange >= 0 ? "+" : ""}{formatCurrency(pb.valueChange, currency)}
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        ) : null}
      </div>
    );
  };

  // Determine fill color for combined bars based on row sub-type
  const getBarFillColor = (subType: string, isPos: boolean): string => {
    if (subType === "open") return OPEN_COLOR;
    if (subType === "close") return CLOSE_COLOR;
    if (subType === "invest") return isPos ? COMBINED_INVEST_COLOR : COMBINED_WITHDRAW_COLOR;
    if (subType === "value") return isPos ? COMBINED_GAIN_COLOR : COMBINED_LOSS_COLOR;
    return "#888";
  };

  // Custom bar shape that picks color based on row subType
  const CombinedBar = (props: any) => {
    const { x, y, width, height, payload, dataKey } = props;
    if (!payload || height === 0 || !width) return null;
    const isPos = dataKey === "bar_pos";
    const fill = getBarFillColor(payload.subType, isPos);
    const rx = isPos ? 3 : 0;
    const ry = isPos ? 3 : 0;
    if (height < 0) {
      return <rect x={x} y={y + height} width={width} height={Math.abs(height)} fill={fill} rx={ry} ry={ry} />;
    }
    return <rect x={x} y={y} width={width} height={height} fill={fill} rx={rx} ry={ry} />;
  };

  return (
    <Card data-testid="waterfall-chart-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>Portfolio Waterfall</CardTitle>
          <CardDescription>
            Per-period opening value, net new capital, value appreciation, and closing value
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-md border p-0.5" data-testid="waterfall-view-toggle">
            {viewModeBtns.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setViewMode(key)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                  viewMode === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-testid={`waterfall-view-${key}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-md border p-0.5" data-testid="waterfall-granularity-toggle">
            {granularityBtns.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setGranularity(key)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                  granularity === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-testid={`waterfall-granularity-${key}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[380px] flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !chartData.length ? (
          <div className="h-[380px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Not enough data to display waterfall chart.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-[380px] overflow-x-auto" data-testid="waterfall-chart-container">
              <div style={{ minWidth: Math.max(600, chartData.length * 18) }}>
                <ResponsiveContainer width="100%" height={380}>
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 24 }}
                    barGap={0}
                    barCategoryGap="8%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="xLabel"
                      tick={<CustomXAxisTick />}
                      tickLine={false}
                      axisLine={false}
                      height={36}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatCompactCurrency(v, currency)}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      width={72}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                    <Tooltip content={customTooltip} />

                    {/* Transparent connector bars (offset) */}
                    <Bar dataKey="connector" stackId="main" fill="transparent" isAnimationActive={false} legendType="none" />
                    <Bar dataKey="connector_neg" stackId="main" fill="transparent" isAnimationActive={false} legendType="none" />

                    {viewMode === "combined" ? (
                      <>
                        <Bar dataKey="bar_pos" stackId="main" shape={<CombinedBar />} isAnimationActive={false} />
                        <Bar dataKey="bar_neg" stackId="main" shape={<CombinedBar />} isAnimationActive={false} />
                      </>
                    ) : (
                      <>
                        {allPlatforms.map(p => (
                          <Bar
                            key={`p_pos_${p.id}`}
                            dataKey={`p_pos_${p.id}`}
                            stackId="main"
                            fill={p.color}
                            isAnimationActive={false}
                            name={p.name}
                            legendType="none"
                          />
                        ))}
                        {allPlatforms.map(p => (
                          <Bar
                            key={`p_neg_${p.id}`}
                            dataKey={`p_neg_${p.id}`}
                            stackId="main"
                            fill={p.color}
                            isAnimationActive={false}
                            legendType="none"
                          />
                        ))}
                        {/* For open/close bars in platform mode, use the combined fallback bar_pos/bar_neg */}
                        <Bar dataKey="bar_pos" stackId="main" fill={OPEN_COLOR} isAnimationActive={false} legendType="none" />
                        <Bar dataKey="bar_neg" stackId="main" fill={COMBINED_LOSS_COLOR} isAnimationActive={false} legendType="none" />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground" data-testid="waterfall-legend">
              {viewMode === "combined" ? (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: OPEN_COLOR }} />
                    Open / Close
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: COMBINED_INVEST_COLOR }} />
                    Net Investment
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: COMBINED_WITHDRAW_COLOR }} />
                    Net Withdrawal
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: COMBINED_GAIN_COLOR }} />
                    Value Gain
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: COMBINED_LOSS_COLOR }} />
                    Value Loss
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: OPEN_COLOR }} />
                    Open / Close
                  </span>
                  {allPlatforms.map(p => (
                    <span key={p.id} className="flex items-center gap-1.5" data-testid={`waterfall-legend-platform-${p.id}`}>
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
