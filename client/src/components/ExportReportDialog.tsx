import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Download } from "lucide-react";
import { useAuth } from "@/App";
import { formatCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";

type PeriodType = "month" | "quarter" | "year";

interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
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

  async function handleGenerate() {
    setGenerating(true);
    try {
      const periodLabel = getPeriodLabel();
      const waterfallKey = getWaterfallKey();

      const [momRes, rollingRes, waterfallRes, insightRes] = await Promise.allSettled([
        fetch("/api/portfolio/platform-mom", { credentials: "include" }).then(r => r.json()),
        fetch("/api/portfolio/platform-rolling-returns", { credentials: "include" }).then(r => r.json()),
        fetch(`/api/portfolio/waterfall?granularity=${periodType}`, { credentials: "include" }).then(r => r.json()),
        fetch("/api/insights", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `Give a concise 3-4 sentence portfolio performance summary for ${periodLabel}. Focus on key gains, notable movements, diversification, and any risks.`,
          }),
        }).then(r => r.json()),
      ]);

      const momData: any[] = momRes.status === "fulfilled" ? momRes.value : [];
      const rollingData: any = rollingRes.status === "fulfilled" ? rollingRes.value : null;
      const waterfallData: any[] = waterfallRes.status === "fulfilled" ? waterfallRes.value : [];
      const insightData: any = insightRes.status === "fulfilled" ? insightRes.value : null;

      const periodEntry = waterfallData.find((p: any) => p.period === waterfallKey) ?? null;

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
        const roi =
          periodEntry.openValue > 0
            ? fmtPct((periodEntry.valueChange / periodEntry.openValue) * 100)
            : "—";

        const deposited = Math.max(0, periodEntry.netInvested);
        const withdrawn = Math.abs(Math.min(0, periodEntry.netInvested));

        const snapshotRows = [
          ["Opening Value", fmt(periodEntry.openValue)],
          ["Capital Deposited", fmt(deposited)],
          ["Capital Withdrawn", fmt(withdrawn)],
          ["Value Gain / Loss", `${periodEntry.valueChange >= 0 ? "+" : ""}${fmt(periodEntry.valueChange)}`],
          ["Closing Value", fmt(periodEntry.closeValue)],
          ["Period ROI", roi],
        ];

        autoTable(doc, {
          startY: y,
          head: [["Metric", "Value"]],
          body: snapshotRows,
          margin: { left: margin, right: margin },
          styles: { fontSize: 10, cellPadding: 3 },
          headStyles: { fillColor: [59, 130, 246] as [number, number, number], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
          columnStyles: { 1: { halign: "right" } },
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      }

      // ── Capital Flow by Platform ─────────────────────────────────────
      if (periodEntry?.platformBreakdown?.length > 0) {
        const platformRows = [...periodEntry.platformBreakdown]
          .filter((pb: any) => Math.abs(pb.netInvested) > 0.01 || Math.abs(pb.valueChange) > 0.01)
          .sort((a: any, b: any) => Math.abs(b.valueChange) - Math.abs(a.valueChange))
          .map((pb: any) => [
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
            headStyles: { fillColor: [16, 185, 129] as [number, number, number], textColor: 255, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
            columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
          });
          y = (doc as any).lastAutoTable.finalY + 8;
        }
      }

      // ── Platform Performance ─────────────────────────────────────────
      if (momData.length > 0) {
        checkPage(40);
        sectionTitle("Platform Performance");

        const d30Map = new Map<number, any>();
        const d90Map = new Map<number, any>();
        if (rollingData) {
          for (const e of rollingData.d30 ?? []) d30Map.set(e.platformId, e);
          for (const e of rollingData.d90 ?? []) d90Map.set(e.platformId, e);
        }

        const perfRows = momData
          .filter((p: any) => p.currentValue > 0)
          .sort((a: any, b: any) => b.currentValue - a.currentValue)
          .map((p: any) => {
            const r30 = d30Map.get(p.platformId);
            const r90 = d90Map.get(p.platformId);
            return [
              p.name,
              fmt(p.currentValue),
              p.momGrowthPercent != null ? fmtPct(p.momGrowthPercent) : "—",
              r30 && !r30.stale ? fmtPct(r30.pct) : "—",
              r90 && !r90.stale ? fmtPct(r90.pct) : "—",
            ];
          });

        autoTable(doc, {
          startY: y,
          head: [["Platform", "Current Value", "MoM", "30d", "90d"]],
          body: perfRows,
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [99, 102, 241] as [number, number, number], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
          columnStyles: {
            1: { halign: "right" },
            2: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right" },
          },
        });
        y = (doc as any).lastAutoTable.finalY + 8;
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
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(160, 160, 160);
        doc.text(
          `InvestTrack · ${periodLabel} Report · Page ${i} of ${pageCount}`,
          pageW / 2,
          pageH - 8,
          { align: "center" },
        );
      }

      const filename = `report-${waterfallKey.toLowerCase().replace(/[\s]/g, "-")}.pdf`;
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
            {" "}Includes portfolio snapshot, platform performance, and AI insights.
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
