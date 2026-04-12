import { useMemo } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatCompactCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Granularity = "month" | "quarter" | "year";

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

export interface WaterfallChartProps {
  currency: string;
  excludedPlatforms: Set<number>;
  granularity: Granularity;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatPeriodLabel(period: string, granularity: Granularity): string {
  if (granularity === "year") return period;
  if (granularity === "quarter") {
    const [y, q] = period.split("-");
    return `${q} ${y}`;
  }
  const [y, m] = period.split("-");
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
}

const OPEN_COLOR = "#94a3b8";
const INVEST_POS_COLOR = "#3b82f6";
const INVEST_NEG_COLOR = "#f97316";
const RETURNS_POS_COLOR = "#10b981";
const RETURNS_NEG_COLOR = "#ef4444";
const CLOSE_COLOR = "#64748b";

interface ChartRow {
  xLabel: string;
  subType: "open" | "invest" | "value" | "close";
  period: string;
  periodLabel: string;
  openValue: number;
  netInvested: number;
  valueChange: number;
  closeValue: number;
  connector: number;
  bar_pos: number;
  bar_neg: number;
}

const CustomXAxisTick = ({ x, y, payload }: any) => {
  const label: string = payload?.value ?? "";
  const [periodLabel, subType] = label.split("|");
  if (subType !== "invest") return null;
  return (
    <text x={x} y={y + 14} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={10}>
      {periodLabel}
    </text>
  );
};

function getBarFill(subType: string, isPos: boolean): string {
  if (subType === "open") return OPEN_COLOR;
  if (subType === "close") return CLOSE_COLOR;
  if (subType === "invest") return isPos ? INVEST_POS_COLOR : INVEST_NEG_COLOR;
  if (subType === "value") return isPos ? RETURNS_POS_COLOR : RETURNS_NEG_COLOR;
  return "#888";
}

const CombinedBar = (props: any) => {
  const { x, y, width, height, payload, dataKey } = props;
  if (!payload || !width || height === 0) return null;
  const isPos = dataKey === "bar_pos";
  const fill = getBarFill(payload.subType, isPos);
  const r = (payload.subType === "open" || payload.subType === "close") ? 3 : isPos ? 3 : 0;
  if (height < 0) {
    return <rect x={x} y={y + height} width={width} height={Math.abs(height)} fill={fill} rx={r} ry={r} />;
  }
  return <rect x={x} y={y} width={width} height={height} fill={fill} rx={r} ry={r} />;
};

function WaterfallTooltip({ active, payload, label, currency, chartRows, rawData }: any) {
  if (!active || !payload?.length || !label) return null;
  const row: ChartRow | undefined = chartRows.find((r: ChartRow) => r.xLabel === label);
  if (!row) return null;
  const period = rawData?.find((p: WaterfallPeriod) => p.period === row.period);

  const subLabel: Record<string, string> = {
    open: "Opening Value",
    invest: row.netInvested >= 0 ? "Net Invested" : "Net Withdrawn",
    value: row.valueChange >= 0 ? "Value Gain" : "Value Loss",
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
    invest: row.netInvested >= 0 ? INVEST_POS_COLOR : INVEST_NEG_COLOR,
    value: row.valueChange >= 0 ? RETURNS_POS_COLOR : RETURNS_NEG_COLOR,
    close: CLOSE_COLOR,
  };

  const topInvested = period
    ? [...period.platformBreakdown]
        .filter((p: PlatformBreakdown) => Math.abs(p.netInvested) > 0.01)
        .sort((a: PlatformBreakdown, b: PlatformBreakdown) => Math.abs(b.netInvested) - Math.abs(a.netInvested))
        .slice(0, 3)
    : [];
  const topReturns = period
    ? [...period.platformBreakdown]
        .filter((p: PlatformBreakdown) => Math.abs(p.valueChange) > 0.01)
        .sort((a: PlatformBreakdown, b: PlatformBreakdown) => Math.abs(b.valueChange) - Math.abs(a.valueChange))
        .slice(0, 3)
    : [];

  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs min-w-[190px]">
      <p className="font-semibold mb-0.5 text-sm">{row.periodLabel}</p>
      <p className="text-muted-foreground mb-2">{subLabel[row.subType]}</p>
      <p className="font-bold text-sm mb-2" style={{ color: subColor[row.subType] }}>
        {(row.subType === "invest" || row.subType === "value") && subValue[row.subType] >= 0 ? "+" : ""}
        {formatCurrency(subValue[row.subType], currency)}
      </p>

      {row.subType === "invest" && topInvested.length > 0 && (
        <div className="border-t pt-1.5 mb-2 space-y-0.5">
          {topInvested.map((p: PlatformBreakdown) => (
            <div key={p.platformId} className="flex justify-between gap-3 text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </span>
              <span className={p.netInvested >= 0 ? "text-blue-500" : "text-orange-500"}>
                {p.netInvested >= 0 ? "+" : ""}{formatCurrency(p.netInvested, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {row.subType === "value" && topReturns.length > 0 && (
        <div className="border-t pt-1.5 mb-2 space-y-0.5">
          {topReturns.map((p: PlatformBreakdown) => (
            <div key={p.platformId} className="flex justify-between gap-3 text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </span>
              <span className={p.valueChange >= 0 ? "text-emerald-500" : "text-red-500"}>
                {p.valueChange >= 0 ? "+" : ""}{formatCurrency(p.valueChange, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className={cn("border-t pt-1.5 space-y-0.5", row.subType === "invest" || row.subType === "value" ? "" : "")}>
        <div className="flex justify-between gap-4 text-muted-foreground">
          <span>Open</span><span>{formatCurrency(row.openValue, currency)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Invested</span>
          <span className={row.netInvested >= 0 ? "text-blue-500" : "text-orange-500"}>
            {row.netInvested >= 0 ? "+" : ""}{formatCurrency(row.netInvested, currency)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Value Δ</span>
          <span className={row.valueChange >= 0 ? "text-emerald-500" : "text-red-500"}>
            {row.valueChange >= 0 ? "+" : ""}{formatCurrency(row.valueChange, currency)}
          </span>
        </div>
        <div className="flex justify-between gap-4 font-semibold border-t pt-0.5">
          <span>Close</span><span>{formatCurrency(row.closeValue, currency)}</span>
        </div>
      </div>
    </div>
  );
}

export function WaterfallChart({ currency, excludedPlatforms, granularity }: WaterfallChartProps) {
  const excludeParam = Array.from(excludedPlatforms).sort().join(",");

  const { data: waterfallData, isLoading } = useQuery<WaterfallPeriod[]>({
    queryKey: ["/api/portfolio/waterfall", granularity, excludeParam],
    queryFn: async () => {
      const params = new URLSearchParams({ granularity });
      if (excludedPlatforms.size > 0) params.set("excludePlatforms", excludeParam);
      const res = await fetch(`/api/portfolio/waterfall?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch waterfall data");
      return res.json();
    },
  });

  const chartRows = useMemo<ChartRow[]>(() => {
    if (!waterfallData) return [];
    const rows: ChartRow[] = [];

    for (const period of waterfallData) {
      const periodLabel = formatPeriodLabel(period.period, granularity);
      const { openValue, netInvested, valueChange, closeValue } = period;

      const base = {
        period: period.period,
        periodLabel,
        openValue,
        netInvested,
        valueChange,
        closeValue,
      };

      rows.push({
        ...base,
        xLabel: `${periodLabel}|open`,
        subType: "open",
        connector: 0,
        bar_pos: openValue >= 0 ? openValue : 0,
        bar_neg: openValue < 0 ? openValue : 0,
      });

      const investBase = openValue;
      rows.push({
        ...base,
        xLabel: `${periodLabel}|invest`,
        subType: "invest",
        connector: Math.max(0, investBase),
        bar_pos: netInvested >= 0 ? netInvested : 0,
        bar_neg: netInvested < 0 ? netInvested : 0,
      });

      const valueBase = openValue + netInvested;
      rows.push({
        ...base,
        xLabel: `${periodLabel}|value`,
        subType: "value",
        connector: Math.max(0, valueBase),
        bar_pos: valueChange >= 0 ? valueChange : 0,
        bar_neg: valueChange < 0 ? valueChange : 0,
      });

      rows.push({
        ...base,
        xLabel: `${periodLabel}|close`,
        subType: "close",
        connector: 0,
        bar_pos: closeValue >= 0 ? closeValue : 0,
        bar_neg: closeValue < 0 ? closeValue : 0,
      });
    }
    return rows;
  }, [waterfallData, granularity]);

  if (isLoading) return <Skeleton className="h-full w-full" />;

  if (!chartRows.length) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex-1 min-h-0" data-testid="waterfall-chart-container">
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartRows}
              margin={{ top: 8, right: 16, left: 0, bottom: 28 }}
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
                width={68}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Tooltip
                content={
                  <WaterfallTooltip
                    currency={currency}
                    chartRows={chartRows}
                    rawData={waterfallData}
                  />
                }
              />
              <Bar dataKey="connector" stackId="wf" fill="transparent" isAnimationActive={false} legendType="none" />
              <Bar dataKey="bar_pos" stackId="wf" shape={<CombinedBar />} isAnimationActive={false} legendType="none" />
              <Bar dataKey="bar_neg" stackId="wf" shape={<CombinedBar />} isAnimationActive={false} legendType="none" />
            </ComposedChart>
          </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: OPEN_COLOR }} />
          Open / Close
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: INVEST_POS_COLOR }} />
          Net Invested
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: INVEST_NEG_COLOR }} />
          Net Withdrawn
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: RETURNS_POS_COLOR }} />
          Value Gain
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: RETURNS_NEG_COLOR }} />
          Value Loss
        </span>
      </div>
    </div>
  );
}
