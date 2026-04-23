import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Download } from "lucide-react";
import { useAuth } from "@/App";
import { formatCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";

// ── API response types ──────────────────────────────────────────────────────

interface PlatformBreakdown {
  platformId: number;
  name: string;
  netInvested: number;
  valueChange: number;
}

interface WaterfallPeriod {
  period: string;
  openValue: number;
  closeValue: number;
  netInvested: number;
  valueChange: number;
  isLive?: boolean;
  platformBreakdown?: PlatformBreakdown[];
}

interface PlatformMom {
  platformId: number;
  name: string;
  currentValue: number;
  momChange: number;
  momGrowthPercent: number;
}

interface RollingEntry {
  platformId: number;
  name: string;
  change: number;
  pct: number;
  stale?: boolean;
}

interface RollingReturns {
  d7: RollingEntry[];
  d30: RollingEntry[];
  d90: RollingEntry[];
}

interface InsightResponse {
  insight?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

type PeriodType = "month" | "quarter" | "year";

interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function ExportReportDialog({ open, onOpenChange, currency }: ExportReportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const now = new Date();

  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedQuarter, setSelectedQuarter] = useState("1");
  const [generating, setGenerating] = useState(false);

  const availableYears = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - i));

  function getPeriodLabel(): string {
    if (periodType === "year") return selectedYear;
    if (periodType === "quarter") return `Q${selectedQuarter} ${selectedYear}`;
    return `${MONTH_NAMES[Number(selectedMonth) - 1]} ${selectedYear}`;
  }

  function getWaterfallKey(): string {
    if (periodType === "year") return selectedYear;
    if (periodType === "quarter") return `${selectedYear}-Q${selectedQuarter}`;
    return `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
  }

  /** Return periods from `allPeriods` that belong to the scope of the selected report. */
  function getPeriodHistoryRows(allPeriods: WaterfallPeriod[]): WaterfallPeriod[] {
    if (periodType === "year") {
      // All years up to and including the selected year — sorted ascending
      return [...allPeriods]
        .filter(p => /^\d{4}$/.test(p.period) && p.period <= selectedYear)
        .sort((a, b) => a.period.localeCompare(b.period));
    }
    if (periodType === "quarter") {
      // All quarters whose year matches selectedYear
      return [...allPeriods]
        .filter(p => p.period.startsWith(selectedYear + "-Q"))
        .sort((a, b) => a.period.localeCompare(b.period));
    }
    // Month: all months for the selected year
    return [...allPeriods]
      .filter(p => p.period.startsWith(selectedYear + "-") && !p.period.includes("Q"))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  function formatPeriodLabel(period: string): string {
    // "2025" → "2025"
    // "2025-Q2" → "Q2 2025"
    // "2025-03" → "Mar 2025"
    if (/^\d{4}$/.test(period)) return period;
    const qMatch = period.match(/^(\d{4})-Q(\d)$/);
    if (qMatch) return `Q${qMatch[2]} ${qMatch[1]}`;
    const mMatch = period.match(/^(\d{4})-(\d{2})$/);
    if (mMatch) {
      const mIdx = parseInt(mMatch[2], 10) - 1;
      return `${MONTH_NAMES[mIdx]?.slice(0, 3) ?? mMatch[2]} ${mMatch[1]}`;
    }
    return period;
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const periodLabel = getPeriodLabel();
      const waterfallKey = getWaterfallKey();

      // Step 1: Fetch period data and current snapshot in parallel (no AI yet)
      const [momRes, rollingRes, waterfallRes] = await Promise.allSettled([
        fetch("/api/portfolio/platform-mom", { credentials: "include" }).then(r => r.json() as Promise<PlatformMom[]>),
        fetch("/api/portfolio/platform-rolling-returns", { credentials: "include" }).then(r => r.json() as Promise<RollingReturns>),
        fetch(`/api/portfolio/waterfall?granularity=${periodType}`, { credentials: "include" }).then(r => r.json() as Promise<WaterfallPeriod[]>),
      ]);

      const momData: PlatformMom[] = momRes.status === "fulfilled" ? momRes.value : [];
      const rollingData: RollingReturns | null = rollingRes.status === "fulfilled" ? rollingRes.value : null;
      const waterfallData: WaterfallPeriod[] = waterfallRes.status === "fulfilled" ? waterfallRes.value : [];

      const periodEntry = waterfallData.find(p => p.period === waterfallKey) ?? null;
      const historyRows = getPeriodHistoryRows(waterfallData);

      // Warn the user if the selected period has no portfolio data at all
      if (!periodEntry && historyRows.length === 0) {
        toast({
          title: "No data for this period",
          description: `No portfolio records were found for ${getPeriodLabel()}. Try selecting a different period.`,
          variant: "destructive",
        });
        setGenerating(false);
        return;
      }

      // Step 2: Build a data-enriched AI prompt using actual period metrics
      const periodRoi = periodEntry && periodEntry.openValue > 0
        ? ((periodEntry.valueChange / periodEntry.openValue) * 100).toFixed(2)
        : null;
      const topGainers = (periodEntry?.platformBreakdown ?? [])
        .filter(pb => pb.valueChange > 0)
        .sort((a, b) => b.valueChange - a.valueChange)
        .slice(0, 3)
        .map(pb => `${pb.name}: +${formatCurrency(pb.valueChange, currency)}`)
        .join(", ");
      const topLosers = (periodEntry?.platformBreakdown ?? [])
        .filter(pb => pb.valueChange < 0)
        .sort((a, b) => a.valueChange - b.valueChange)
        .slice(0, 2)
        .map(pb => `${pb.name}: ${formatCurrency(pb.valueChange, currency)}`)
        .join(", ");
      const aiPrompt = [
        `Give a concise 3–4 sentence portfolio performance summary for ${periodLabel}.`,
        periodEntry ? `Period snapshot: opened at ${formatCurrency(periodEntry.openValue, currency)}, closed at ${formatCurrency(periodEntry.closeValue, currency)}, net invested ${formatCurrency(periodEntry.netInvested, currency)}, value change ${formatCurrency(periodEntry.valueChange, currency)}${periodRoi ? `, ROI ${periodRoi}%` : ""}.` : "",
        topGainers ? `Top gainers: ${topGainers}.` : "",
        topLosers ? `Underperformers: ${topLosers}.` : "",
        "Highlight diversification and any risks worth monitoring.",
      ].filter(Boolean).join(" ");

      // Step 3: Fetch AI insight with the enriched prompt
      const insightRes = await fetch("/api/insights", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      }).catch(() => null);
      const insightData: InsightResponse | null = insightRes?.ok
        ? await insightRes.json().catch(() => null)
        : null;

      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 18;
      const contentW = pageW - margin * 2;
      let y = margin;

      const fmt = (v: number) => formatCurrency(v, currency);
      const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

      function checkPage(needed = 30) {
        if (y + needed > pageH - margin) {
          doc.addPage();
          y = margin;
        }
      }

      function sectionTitle(title: string) {
        checkPage(20);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);
        doc.text(title, margin, y);
        y += 1;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(margin, y + 1, pageW - margin, y + 1);
        y += 5;
      }

      type RGB = [number, number, number];

      // ── Header ────────────────────────────────────────────────────────
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("Portfolio Report", margin, y);
      y += 9;

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(`Period: ${periodLabel}`, margin, y);
      y += 5.5;
      doc.text(
        `Generated: ${now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
        margin, y,
      );
      y += 5.5;
      if (user?.email) {
        doc.text(`Account: ${user.email}`, margin, y);
        y += 5.5;
      }
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(margin, y + 2, pageW - margin, y + 2);
      y += 8;

      // ── Portfolio Snapshot ───────────────────────────────────────────
      if (periodEntry) {
        sectionTitle("Portfolio Snapshot");
        const deposited = Math.max(0, periodEntry.netInvested);
        const withdrawn = Math.abs(Math.min(0, periodEntry.netInvested));
        const roi = periodEntry.openValue > 0
          ? fmtPct((periodEntry.valueChange / periodEntry.openValue) * 100)
          : "—";

        autoTable(doc, {
          startY: y,
          head: [["Metric", "Value"]],
          body: [
            ["Opening Value", fmt(periodEntry.openValue)],
            ["Capital Deposited", fmt(deposited)],
            ["Capital Withdrawn", fmt(withdrawn)],
            ["Value Gain / Loss", `${periodEntry.valueChange >= 0 ? "+" : ""}${fmt(periodEntry.valueChange)}`],
            ["Closing Value", fmt(periodEntry.closeValue)],
            ["Period ROI", roi],
          ],
          margin: { left: margin, right: margin },
          styles: { fontSize: 10, cellPadding: 3 },
          headStyles: { fillColor: [59, 130, 246] as RGB, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
          columnStyles: { 1: { halign: "right" } },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // ── Growth History Table ─────────────────────────────────────────
      if (historyRows.length > 0) {
        checkPage(40);
        const histLabel =
          periodType === "year" ? "Yearly Growth History"
          : periodType === "quarter" ? `Quarterly Growth — ${selectedYear}`
          : `Monthly Growth — ${selectedYear}`;
        sectionTitle(histLabel);

        autoTable(doc, {
          startY: y,
          head: [["Period", "Open", "Net Invested", "Gain / Loss", "Close", "ROI"]],
          body: historyRows.map(row => {
            const rowRoi = row.openValue > 0
              ? fmtPct((row.valueChange / row.openValue) * 100)
              : "—";
            return [
              formatPeriodLabel(row.period) + (row.isLive ? " *" : ""),
              fmt(row.openValue),
              `${row.netInvested >= 0 ? "+" : ""}${fmt(row.netInvested)}`,
              `${row.valueChange >= 0 ? "+" : ""}${fmt(row.valueChange)}`,
              fmt(row.closeValue),
              rowRoi,
            ];
          }),
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [37, 99, 235] as RGB, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
          columnStyles: {
            1: { halign: "right" },
            2: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right" },
            5: { halign: "right" },
          },
          didParseCell(data) {
            // Highlight negative gain/loss cells red
            if (data.column.index === 3 && data.section === "body") {
              const raw = data.cell.raw as string;
              if (raw.startsWith("-")) {
                data.cell.styles.textColor = [220, 38, 38] as RGB;
              }
            }
          },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
        // Legend for live period
        if (historyRows.some(r => r.isLive)) {
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(130, 130, 130);
          doc.text("* Current period — data up to latest valuation date", margin, y);
          y += 6;
        } else {
          y += 4;
        }
      }

      // ── Capital Flow by Platform ─────────────────────────────────────
      if ((periodEntry?.platformBreakdown?.length ?? 0) > 0) {
        const platformRows = [...(periodEntry!.platformBreakdown!)]
          .filter(pb => Math.abs(pb.netInvested) > 0.01 || Math.abs(pb.valueChange) > 0.01)
          .sort((a, b) => Math.abs(b.valueChange) - Math.abs(a.valueChange))
          .map(pb => [
            pb.name,
            `${pb.netInvested >= 0 ? "+" : ""}${fmt(pb.netInvested)}`,
            `${pb.valueChange >= 0 ? "+" : ""}${fmt(pb.valueChange)}`,
          ]);

        if (platformRows.length > 0) {
          checkPage(40);
          sectionTitle("Capital Flow by Platform");
          autoTable(doc, {
            startY: y,
            head: [["Platform", "Net Invested", "Value Gain / Loss"]],
            body: platformRows,
            margin: { left: margin, right: margin },
            styles: { fontSize: 10, cellPadding: 3 },
            headStyles: { fillColor: [16, 185, 129] as RGB, textColor: 255, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
            columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
          });
          y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
        }
      }

      // ── Platform Performance ──────────────────────────────────────────
      // Primary: period-scoped returns from the waterfall breakdown.
      // Secondary: current rolling returns (MoM/30d/90d) as a position reference.

      const hasPlatformBreakdown = (periodEntry?.platformBreakdown?.length ?? 0) > 0;

      if (hasPlatformBreakdown) {
        checkPage(40);

        // Build a name→MoM map for current value lookup
        const momByName = new Map<string, PlatformMom>();
        for (const p of momData) momByName.set(p.name, p);

        const periodTypeLabel =
          periodType === "year" ? "YoY" : periodType === "quarter" ? "QoQ" : "MoM";

        sectionTitle(`Platform Returns — ${getPeriodLabel()} (${periodTypeLabel})`);
        autoTable(doc, {
          startY: y,
          head: [["Platform", "Current Value", "Net Invested (period)", "Value Gain / Loss (period)"]],
          body: [...(periodEntry!.platformBreakdown!)]
            .sort((a, b) => b.valueChange - a.valueChange)
            .map(pb => {
              const mom = momByName.get(pb.name);
              return [
                pb.name,
                mom ? fmt(mom.currentValue) : "—",
                `${pb.netInvested >= 0 ? "+" : ""}${fmt(pb.netInvested)}`,
                `${pb.valueChange >= 0 ? "+" : ""}${fmt(pb.valueChange)}`,
              ];
            }),
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [99, 102, 241] as RGB, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
          columnStyles: {
            1: { halign: "right" },
            2: { halign: "right" },
            3: { halign: "right" },
          },
          didParseCell(data) {
            if (data.column.index === 3 && data.section === "body") {
              const raw = data.cell.raw as string;
              if (raw.startsWith("-")) data.cell.styles.textColor = [220, 38, 38] as RGB;
            }
          },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // Current position reference (MoM / 30d / 90d rolling returns from today)
      if (momData.length > 0) {
        checkPage(40);

        const d30Map = new Map<number, RollingEntry>();
        const d90Map = new Map<number, RollingEntry>();
        if (rollingData) {
          for (const e of rollingData.d30) d30Map.set(e.platformId, e);
          for (const e of rollingData.d90) d90Map.set(e.platformId, e);
        }

        sectionTitle("Current Position Reference (rolling from today)");
        autoTable(doc, {
          startY: y,
          head: [["Platform", "Current Value", "MoM", "30d", "90d"]],
          body: momData
            .filter(p => p.currentValue > 0)
            .sort((a, b) => b.currentValue - a.currentValue)
            .map(p => {
              const r30 = d30Map.get(p.platformId);
              const r90 = d90Map.get(p.platformId);
              return [
                p.name,
                fmt(p.currentValue),
                fmtPct(p.momGrowthPercent),
                r30 && !r30.stale ? fmtPct(r30.pct) : "—",
                r90 && !r90.stale ? fmtPct(r90.pct) : "—",
              ];
            }),
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [107, 114, 128] as RGB, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
          columnStyles: {
            1: { halign: "right" },
            2: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right" },
          },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // ── AI Insights ──────────────────────────────────────────────────
      if (insightData?.insight) {
        checkPage(50);
        sectionTitle("AI Portfolio Insights");
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 55, 55);
        const lines: string[] = doc.splitTextToSize(insightData.insight, contentW);
        for (const line of lines) {
          checkPage(6);
          doc.text(line, margin, y);
          y += 5;
        }
      }

      // ── Page footer ──────────────────────────────────────────────────
      const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(160, 160, 160);
        doc.text(
          `InvestTrack · ${getPeriodLabel()} Report · Page ${i} of ${pageCount}`,
          pageW / 2,
          pageH - 8,
          { align: "center" },
        );
      }

      const filename = `report-${getWaterfallKey().toLowerCase()}.pdf`;
      doc.save(filename);
      onOpenChange(false);
      toast({ title: "Report downloaded", description: filename });
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast({
        title: "Export failed",
        description: "Could not generate the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export Portfolio Report</DialogTitle>
          <DialogDescription>
            Choose a period and download a PDF summary of your portfolio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="period-type">Period type</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
              <SelectTrigger id="period-type" data-testid="select-period-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="quarter">Quarter</SelectItem>
                <SelectItem value="year">Year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            {periodType === "month" && (
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="select-month">Month</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger id="select-month" data-testid="select-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {periodType === "quarter" && (
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="select-quarter">Quarter</Label>
                <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                  <SelectTrigger id="select-quarter" data-testid="select-quarter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3", "4"].map(q => (
                      <SelectItem key={q} value={q}>Q{q}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className={periodType === "year" ? "flex-1 space-y-1.5" : "w-28 space-y-1.5"}>
              <Label htmlFor="select-year">Year</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger id="select-year" data-testid="select-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map(yr => (
                    <SelectItem key={yr} value={yr}>{yr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Generating a report for{" "}
            <span className="font-medium text-foreground">{getPeriodLabel()}</span>.
            {" "}Includes snapshot, growth history, platform performance, and AI insights.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={generating} data-testid="button-generate-report">
            {generating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Generate PDF</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
