import { useState, useMemo } from "react";
import { format, addMonths, subMonths, startOfMonth, getDaysInMonth, parseISO, isBefore } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatCurrency, formatCompactCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Payment = { ticker: string; amount: number; paidOn: string; quantity?: number | null };
type Projection = { ticker: string; amount: number; date: string; frequency: string };
type DayEntry = { ticker: string; amount: number; isProjected: boolean; frequency?: string };

function detectFrequency(sortedDates: string[]): { label: string; days: number } {
  if (sortedDates.length < 2) return { label: "annual", days: 365 };
  const gaps: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const d1 = parseISO(sortedDates[i - 1]).getTime();
    const d2 = parseISO(sortedDates[i]).getTime();
    gaps.push((d2 - d1) / 86400000);
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (median >= 25 && median <= 35) return { label: "monthly", days: 30 };
  if (median >= 80 && median <= 100) return { label: "quarterly", days: 91 };
  if (median >= 170 && median <= 200) return { label: "semi-annual", days: 182 };
  return { label: "annual", days: 365 };
}

function computeProjections(payments: Payment[], heldSet: Set<string>, today: Date): Projection[] {
  const byTicker = new Map<string, Payment[]>();
  for (const p of payments) {
    if (!byTicker.has(p.ticker)) byTicker.set(p.ticker, []);
    byTicker.get(p.ticker)!.push(p);
  }
  const maxDate = addMonths(today, 6);
  const results: Projection[] = [];

  for (const [ticker, history] of byTicker.entries()) {
    if (!heldSet.has(ticker)) continue;
    const sorted = [...history].sort((a, b) => a.paidOn.slice(0, 10).localeCompare(b.paidOn.slice(0, 10)));
    const dates = sorted.map(h => h.paidOn.slice(0, 10));
    if (dates.length < 2) continue;
    const { label, days } = detectFrequency(dates);
    const lastDate = parseISO(dates[dates.length - 1]);
    const recentHistory = sorted.slice(-4);
    const avgAmount = recentHistory.reduce((s, h) => s + h.amount, 0) / recentHistory.length;

    let next = new Date(lastDate);
    next.setDate(next.getDate() + days);
    let count = 0;
    while (count < 3 && next <= maxDate) {
      if (next > today) {
        results.push({
          ticker,
          amount: avgAmount,
          date: format(next, "yyyy-MM-dd"),
          frequency: label,
        });
        count++;
      }
      const n2 = new Date(next);
      n2.setDate(n2.getDate() + days);
      next = n2;
    }
  }
  return results;
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  payments: Payment[];
  heldTickers: string[];
  currency: string;
}

export function DividendCalendar({ payments, heldTickers, currency }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(today));
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [openDay, setOpenDay] = useState<string | null>(null);

  const heldSet = useMemo(() => new Set(heldTickers), [heldTickers]);
  const projections = useMemo(() => computeProjections(payments, heldSet, today), [payments, heldSet, today]);

  const dayEntries = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const add = (date: string, entry: DayEntry) => {
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(entry);
    };
    for (const p of payments) {
      add(p.paidOn.slice(0, 10), { ticker: p.ticker, amount: p.amount, isProjected: false });
    }
    for (const proj of projections) {
      add(proj.date, { ticker: proj.ticker, amount: proj.amount, isProjected: true, frequency: proj.frequency });
    }
    return map;
  }, [payments, projections]);

  const barData = useMemo(() => {
    const months: { month: string; key: string; historical: number; projected: number }[] = [];
    for (let i = -3; i < 9; i++) {
      const d = addMonths(today, i);
      const key = format(d, "yyyy-MM");
      months.push({ month: format(d, "MMM yy"), key, historical: 0, projected: 0 });
    }
    for (const p of payments) {
      const key = p.paidOn.slice(0, 7);
      const m = months.find(x => x.key === key);
      if (m) m.historical += p.amount;
    }
    for (const proj of projections) {
      const key = proj.date.slice(0, 7);
      const m = months.find(x => x.key === key);
      if (m) m.projected += proj.amount;
    }
    return months.filter(m => m.historical > 0 || m.projected > 0);
  }, [payments, projections, today]);

  const calendarCells = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const daysInMonth = getDaysInMonth(currentMonth);
    const startOffset = (start.getDay() + 6) % 7;
    const totalCells = Math.ceil((daysInMonth + startOffset) / 7) * 7;
    const cells: { date: Date | null; dateStr: string | null }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ date: null, dateStr: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d);
      cells.push({ date, dateStr: format(date, "yyyy-MM-dd") });
    }
    while (cells.length < totalCells) cells.push({ date: null, dateStr: null });
    return cells;
  }, [currentMonth]);

  const upcomingList = useMemo(() =>
    [...projections].sort((a, b) => a.date.localeCompare(b.date)),
    [projections]
  );

  const todayStr = format(today, "yyyy-MM-dd");
  const fmt = (v: number) => formatCurrency(v, currency);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Monthly Dividend Income</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={barData} barCategoryGap="25%" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10 }}
                width={46}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCompactCurrency(v, currency)}
              />
              <Tooltip
                formatter={(v: number, name: string) => [fmt(v), name === "historical" ? "Received" : "Projected"]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={(name) => name === "historical" ? "Received" : "Projected"} />
              <Bar dataKey="historical" name="historical" stackId="a" fill="#10b981" radius={[0, 0, 2, 2]} />
              <Bar dataKey="projected" name="projected" stackId="a" fill="#10b981" fillOpacity={0.3} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => subMonths(m, 1))} data-testid="calendar-prev-month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold w-32 text-center" data-testid="calendar-month-label">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => addMonths(m, 1))} data-testid="calendar-next-month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={viewMode === "calendar" ? "secondary" : "ghost"}
            onClick={() => setViewMode("calendar")}
            className="h-7 text-xs"
            data-testid="calendar-view-toggle"
          >
            <CalendarDays className="h-3 w-3 mr-1" />
            Calendar
          </Button>
          <Button
            size="sm"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            onClick={() => setViewMode("list")}
            className="h-7 text-xs"
            data-testid="list-view-toggle"
          >
            <List className="h-3 w-3 mr-1" />
            List
          </Button>
        </div>
      </div>

      {viewMode === "calendar" ? (
        <Card>
          <CardContent className="p-3">
            <div className="grid grid-cols-7 mb-1">
              {DAY_HEADERS.map(d => (
                <div key={d} className="text-[10px] font-medium text-muted-foreground text-center py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {calendarCells.map((cell, i) => {
                if (!cell.date || !cell.dateStr) {
                  return <div key={i} className="h-14" />;
                }
                const entries = dayEntries.get(cell.dateStr) || [];
                const hasPast = entries.some(e => !e.isProjected);
                const hasFuture = entries.some(e => e.isProjected);
                const isPastDay = isBefore(cell.date, today);
                const isToday = cell.dateStr === todayStr;
                const total = entries.reduce((s, e) => s + e.amount, 0);

                const cellCls = [
                  "h-14 rounded-md p-1 flex flex-col text-left transition-colors",
                  isToday ? "ring-2 ring-primary ring-offset-1" : "",
                  hasFuture ? "bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/20" : "",
                  hasPast && !hasFuture ? "bg-muted/40 border border-transparent cursor-pointer hover:bg-muted/60" : "",
                  !hasPast && !hasFuture && !isToday ? "opacity-40" : "",
                  isPastDay && !hasPast ? "opacity-30" : "",
                ].filter(Boolean).join(" ");

                const dayNum = (
                  <span className={`text-xs font-medium leading-none ${isPastDay && !isToday ? "text-muted-foreground" : ""}`}>
                    {cell.date.getDate()}
                  </span>
                );

                if (entries.length === 0) {
                  return (
                    <div key={cell.dateStr} className={cellCls}>
                      {dayNum}
                    </div>
                  );
                }

                return (
                  <Popover key={cell.dateStr} open={openDay === cell.dateStr} onOpenChange={(open) => setOpenDay(open ? cell.dateStr : null)}>
                    <PopoverTrigger asChild>
                      <div className={cellCls} data-testid={`calendar-day-${cell.dateStr}`}>
                        {dayNum}
                        <div className="mt-auto overflow-hidden">
                          {hasFuture && (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 leading-none block truncate">
                              ~{fmt(total)}
                            </span>
                          )}
                          {hasPast && !hasFuture && (
                            <span className="text-[10px] text-muted-foreground leading-none block truncate">
                              {fmt(total)}
                            </span>
                          )}
                        </div>
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" side="top" align="center">
                      <p className="text-xs font-semibold mb-2">{format(cell.date, "d MMMM yyyy")}</p>
                      <div className="space-y-1.5">
                        {entries.map((e, j) => (
                          <div key={j} className="text-xs space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-medium truncate">{e.ticker}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <span>{fmt(e.amount)}</span>
                                {e.isProjected && (
                                  <Badge variant="outline" className="text-[9px] py-0 px-1 h-4 leading-none">~est</Badge>
                                )}
                              </div>
                            </div>
                            {e.isProjected && e.frequency && (
                              <p className="text-[10px] text-muted-foreground capitalize pl-0">{e.frequency}</p>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="border-t mt-2 pt-2 flex justify-between items-center text-xs font-semibold">
                        <span>Total</span>
                        <div className="flex items-center gap-1">
                          <span>{fmt(total)}</span>
                          {hasFuture && <Badge variant="outline" className="text-[9px] py-0 px-1 h-4 leading-none text-muted-foreground">estimated</Badge>}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {upcomingList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                No projected payments in the next 6 months.
                <span className="block text-xs mt-1">Projections require at least 2 historical payments per ticker.</span>
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Date</th>
                      <th className="text-left py-2.5 px-2 font-medium text-muted-foreground">Ticker</th>
                      <th className="text-right py-2.5 px-2 font-medium text-muted-foreground">Est. Amount</th>
                      <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingList.map((p, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`list-row-${i}`}>
                        <td className="py-2.5 px-4 text-muted-foreground">{format(parseISO(p.date), "d MMM yyyy")}</td>
                        <td className="py-2.5 px-2 font-mono font-medium">{p.ticker}</td>
                        <td className="py-2.5 px-2 text-right text-emerald-600 dark:text-emerald-400 font-medium">~{fmt(p.amount)}</td>
                        <td className="py-2.5 px-4 text-right text-muted-foreground capitalize">{p.frequency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
