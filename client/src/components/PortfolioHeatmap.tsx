import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompactCurrency } from "@/lib/currency";
import { xirr } from "@/lib/xirr";
import type { PlatformResponse } from "@shared/schema";
import { Button } from "@/components/ui/button";

export interface EnrichedAsset {
  assetId: number;
  assetName: string;
  platformId: number;
  platformName: string;
  platformMode: string;
  category: string;
  assetCategory: string | null;
  currentValue: number;
  invested: number;
  gainLoss: number;
  roi: number;
  acquisitionDate: string | null;
  exitDate: string | null;
}

interface HeatmapCell {
  id: string | number;
  label: string;
  currentValue: number;
  invested: number;
  gainLoss: number;
  roi: number;
  apy: number | null;
  hasChildren: boolean;
}

type DisplayMode = "pct" | "abs";

interface PortfolioHeatmapProps {
  assets: EnrichedAsset[];
  platforms: PlatformResponse[];
  excludedPlatforms: Set<number>;
  currency: string;
}

function extractMaker(name: string): string {
  const trimmed = name.trim();

  const yearPrefix = trimmed.match(/^(\d{4})\s+(.+)$/);
  if (yearPrefix) return extractMaker(yearPrefix[2]);

  const commaIdx = trimmed.indexOf(",");
  if (commaIdx > 0) {
    const beforeComma = trimmed.substring(0, commaIdx).trim();
    if (beforeComma.length > 0 && !/^\d+$/.test(beforeComma)) return beforeComma;
  }

  const twoWordPrefixes = [
    "de bethune", "de tomaso", "aston martin", "rolls royce",
    "alfa romeo", "land rover", "château", "chateau", "domaine",
  ];
  const lower = trimmed.toLowerCase();
  for (const prefix of twoWordPrefixes) {
    if (lower.startsWith(prefix)) return trimmed.split(/\s+/).slice(0, 2).join(" ");
  }

  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function getDurationMonths(acquisitionDate: string | null, exitDate: string | null): number {
  if (!acquisitionDate) return 0;
  const end = exitDate ? new Date(exitDate) : new Date();
  return (end.getTime() - new Date(acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

function computeApy(roi: number, durationMonths: number): number | null {
  if (durationMonths <= 0) return null;
  return (Math.pow(1 + roi / 100, 12 / durationMonths) - 1) * 100;
}

function weightedAvgDuration(items: EnrichedAsset[]): number {
  let totalWeight = 0;
  let totalWeighted = 0;
  for (const a of items) {
    const months = getDurationMonths(a.acquisitionDate, a.exitDate);
    if (months <= 0 || a.invested <= 0) continue;
    totalWeight += a.invested;
    totalWeighted += a.invested * months;
  }
  return totalWeight > 0 ? totalWeighted / totalWeight : 0;
}

function aggregateCells(items: EnrichedAsset[], groupFn: (a: EnrichedAsset) => string, hasChildren: boolean): HeatmapCell[] {
  const map = new Map<string, { currentValue: number; invested: number; gainLoss: number; wMonths: number; wWeight: number }>();
  for (const a of items) {
    const key = groupFn(a);
    const existing = map.get(key) ?? { currentValue: 0, invested: 0, gainLoss: 0, wMonths: 0, wWeight: 0 };
    existing.currentValue += a.currentValue;
    existing.invested += a.invested;
    existing.gainLoss += a.gainLoss;
    const months = getDurationMonths(a.acquisitionDate, a.exitDate);
    if (months > 0 && a.invested > 0) {
      existing.wMonths += a.invested * months;
      existing.wWeight += a.invested;
    }
    map.set(key, existing);
  }
  const cells: HeatmapCell[] = [];
  for (const [key, data] of map.entries()) {
    const roi = data.invested > 0 ? (data.gainLoss / data.invested) * 100 : 0;
    const avgMonths = data.wWeight > 0 ? data.wMonths / data.wWeight : 0;
    const apy = computeApy(roi, avgMonths);
    cells.push({ id: key, label: key, currentValue: data.currentValue, invested: data.invested, gainLoss: data.gainLoss, roi, apy, hasChildren });
  }
  return cells.sort((a, b) => b.currentValue - a.currentValue);
}

function getCellColor(roi: number): string {
  if (roi === 0) return "rgba(100,116,139,0.18)";
  const intensity = Math.min(Math.abs(roi) / 20, 1);
  if (roi > 0) return `rgba(16,185,129,${0.15 + intensity * 0.7})`;
  return `rgba(239,68,68,${0.15 + intensity * 0.7})`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function HeatCell({
  cell,
  currency,
  displayMode,
  onClick,
}: {
  cell: HeatmapCell;
  currency: string;
  displayMode: DisplayMode;
  onClick?: () => void;
}) {
  const bg = getCellColor(cell.roi);
  const intensity = Math.min(Math.abs(cell.roi) / 20, 1);
  const textColor = intensity > 0.55 ? "#fff" : undefined;

  return (
    <div
      className={cn(
        "rounded-lg p-3 flex flex-col gap-1 min-h-[90px] transition-transform",
        cell.hasChildren && onClick ? "cursor-pointer hover:scale-[1.02] hover:shadow-md" : "cursor-default"
      )}
      style={{ backgroundColor: bg, color: textColor }}
      onClick={cell.hasChildren && onClick ? onClick : undefined}
      data-testid={`heatmap-cell-${cell.id}`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-sm font-semibold leading-tight truncate">{cell.label}</span>
        {cell.hasChildren && onClick && (
          <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-70 mt-0.5" />
        )}
      </div>
      <div className="mt-auto space-y-0.5">
        <div className="text-xs font-bold">
          {displayMode === "pct"
            ? fmtPct(cell.roi)
            : `${cell.gainLoss >= 0 ? "+" : ""}${formatCompactCurrency(cell.gainLoss, currency)}`}
        </div>
        {cell.apy !== null && (
          <div className="text-[10px] opacity-75">{fmtPct(cell.apy)} APY</div>
        )}
        <div className="text-[10px] opacity-80">
          {formatCompactCurrency(cell.currentValue, currency)} / {formatCompactCurrency(cell.invested, currency)} invested
        </div>
      </div>
    </div>
  );
}

const ALL_SENTINEL = "__ALL__";

export function PortfolioHeatmap({ assets, platforms, excludedPlatforms, currency }: PortfolioHeatmapProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("pct");
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [drillPlatformId, setDrillPlatformId] = useState<number | null>(null);
  const [drillAssetCategory, setDrillAssetCategory] = useState<string | null>(null);
  const [drillMaker, setDrillMaker] = useState<string | null>(null);

  const { data: rawCashFlows } = useQuery<{ platformId: number; cashFlows: { date: string; amount: number }[] }[]>({
    queryKey: ["/api/analytics/platform-cashflows"],
  });

  const cfMap = useMemo(() => {
    const m = new Map<number, { date: string; amount: number }[]>();
    for (const entry of rawCashFlows ?? []) {
      m.set(entry.platformId, entry.cashFlows);
    }
    return m;
  }, [rawCashFlows]);

  const filteredAssets = useMemo(
    () => assets.filter((a) => !excludedPlatforms.has(a.platformId)),
    [assets, excludedPlatforms]
  );

  const filteredPlatforms = useMemo(
    () => platforms.filter((p) => !excludedPlatforms.has(p.id)),
    [platforms, excludedPlatforms]
  );

  // Level 1: platform categories
  const levelOneCells = useMemo((): HeatmapCell[] => {
    const today = new Date();
    const map = new Map<string, { currentValue: number; invested: number }>();
    for (const p of filteredPlatforms) {
      const existing = map.get(p.category) ?? { currentValue: 0, invested: 0 };
      existing.currentValue += Number(p.currentValue) || 0;
      existing.invested += Number(p.totalInvested) || 0;
      map.set(p.category, existing);
    }

    // Group platforms by category
    const catPlatformMap = new Map<string, PlatformResponse[]>();
    for (const p of filteredPlatforms) {
      const arr = catPlatformMap.get(p.category) ?? [];
      arr.push(p);
      catPlatformMap.set(p.category, arr);
    }

    // Weighted duration per category from enriched assets (for non-standard platforms)
    const platCatMap = new Map<number, string>();
    for (const p of filteredPlatforms) platCatMap.set(p.id, p.category);
    const durMap = new Map<string, { wMonths: number; wWeight: number }>();
    for (const a of filteredAssets) {
      const cat = platCatMap.get(a.platformId);
      if (!cat) continue;
      const months = getDurationMonths(a.acquisitionDate, a.exitDate);
      if (months <= 0 || a.invested <= 0) continue;
      const d = durMap.get(cat) ?? { wMonths: 0, wWeight: 0 };
      d.wMonths += a.invested * months; d.wWeight += a.invested;
      durMap.set(cat, d);
    }

    const cells: HeatmapCell[] = [];
    for (const [cat, data] of map.entries()) {
      const gainLoss = data.currentValue - data.invested;
      const roi = data.invested > 0 ? (gainLoss / data.invested) * 100 : 0;

      let apy: number | null = null;
      const catPlatforms = catPlatformMap.get(cat) ?? [];
      const allStandard = catPlatforms.length > 0 && catPlatforms.every((p) => p.platformMode === "standard");

      if (allStandard) {
        // Use XIRR for pure standard-mode categories
        const combined: { date: Date; amount: number }[] = [];
        for (const p of catPlatforms) {
          for (const cf of cfMap.get(p.id) ?? []) {
            combined.push({ date: new Date(cf.date), amount: cf.amount });
          }
          const cv = Number(p.currentValue) || 0;
          if (cv > 0) combined.push({ date: today, amount: cv });
        }
        apy = combined.length >= 2 ? xirr(combined) : null;
      } else {
        // Duration-based APY from asset acquisition dates
        const d = durMap.get(cat);
        const avgMonths = d && d.wWeight > 0 ? d.wMonths / d.wWeight : 0;
        apy = computeApy(roi, avgMonths);
      }

      cells.push({ id: cat, label: cat, currentValue: data.currentValue, invested: data.invested, gainLoss, roi, apy, hasChildren: true });
    }
    return cells.sort((a, b) => b.currentValue - a.currentValue);
  }, [filteredPlatforms, filteredAssets, cfMap]);

  // Level 2: platforms (within category or all)
  const levelTwoCells = useMemo((): HeatmapCell[] => {
    if (!drillCategory) return [];
    const today = new Date();
    const source = drillCategory === ALL_SENTINEL
      ? filteredPlatforms
      : filteredPlatforms.filter((p) => p.category === drillCategory);
    // Weighted duration per platform from enriched assets (for non-standard platforms)
    const durMap = new Map<number, { wMonths: number; wWeight: number }>();
    for (const a of filteredAssets) {
      const months = getDurationMonths(a.acquisitionDate, a.exitDate);
      if (months <= 0 || a.invested <= 0) continue;
      const d = durMap.get(a.platformId) ?? { wMonths: 0, wWeight: 0 };
      d.wMonths += a.invested * months; d.wWeight += a.invested;
      durMap.set(a.platformId, d);
    }
    return source
      .map((p) => {
        const currentValue = Number(p.currentValue) || 0;
        const invested = Number(p.totalInvested) || 0;
        const gainLoss = currentValue - invested;
        const roi = invested > 0 ? (gainLoss / invested) * 100 : 0;

        let apy: number | null = null;
        if (p.platformMode === "standard") {
          // Use XIRR for standard-mode platforms
          const cfs = cfMap.get(p.id) ?? [];
          const combined: { date: Date; amount: number }[] = cfs.map((cf) => ({
            date: new Date(cf.date),
            amount: cf.amount,
          }));
          if (currentValue > 0) combined.push({ date: today, amount: currentValue });
          apy = combined.length >= 2 ? xirr(combined) : null;
        } else {
          const d = durMap.get(p.id);
          const avgMonths = d && d.wWeight > 0 ? d.wMonths / d.wWeight : 0;
          apy = computeApy(roi, avgMonths);
        }

        return {
          id: p.id, label: p.name, currentValue, invested, gainLoss, roi, apy,
          hasChildren: p.platformMode === "asset_returns" || p.platformMode === "item_valuations",
        };
      })
      .sort((a, b) => b.currentValue - a.currentValue);
  }, [drillCategory, filteredPlatforms, filteredAssets, cfMap]);

  const drilledPlatform = useMemo(
    () => (drillPlatformId ? platforms.find((p) => p.id === drillPlatformId) : null),
    [drillPlatformId, platforms]
  );
  const isItemValuations = drilledPlatform?.platformMode === "item_valuations";

  // Assets for current platform — or ALL platforms when drillPlatformId === -1 (all-assets mode)
  const platformAssets = useMemo(() => {
    if (drillPlatformId === -1) return filteredAssets;
    return filteredAssets.filter((a) => a.platformId === drillPlatformId);
  }, [filteredAssets, drillPlatformId]);

  // Level 3: description groups (item_valuations) or direct assets (asset_returns)
  const levelThreeCells = useMemo((): HeatmapCell[] => {
    if (!drillPlatformId) return [];
    if (drillPlatformId === -1) {
      // All assets mode: group by platform name
      return aggregateCells(platformAssets, (a) => a.platformName, false);
    }
    if (isItemValuations) {
      return aggregateCells(
        platformAssets,
        (a) => a.assetCategory ?? "Uncategorized",
        true
      );
    }
    return platformAssets.map((a) => {
      const months = getDurationMonths(a.acquisitionDate, a.exitDate);
      return {
        id: a.assetId, label: a.assetName,
        currentValue: a.currentValue, invested: a.invested, gainLoss: a.gainLoss, roi: a.roi,
        apy: computeApy(a.roi, months),
        hasChildren: false,
      };
    }).sort((a, b) => b.currentValue - a.currentValue);
  }, [drillPlatformId, isItemValuations, platformAssets]);

  const descriptionAssets = useMemo(
    () => platformAssets.filter((a) => (a.assetCategory ?? "Uncategorized") === drillAssetCategory),
    [platformAssets, drillAssetCategory]
  );

  // Level 4: maker groups within description group
  const levelFourCells = useMemo((): HeatmapCell[] => {
    if (!drillAssetCategory) return [];
    return aggregateCells(descriptionAssets, (a) => extractMaker(a.assetName), true);
  }, [drillAssetCategory, descriptionAssets]);

  // Level 5: individual assets within maker group
  const levelFiveCells = useMemo((): HeatmapCell[] => {
    if (!drillMaker) return [];
    return descriptionAssets
      .filter((a) => extractMaker(a.assetName) === drillMaker)
      .map((a) => {
        const months = getDurationMonths(a.acquisitionDate, a.exitDate);
        return {
          id: a.assetId, label: a.assetName,
          currentValue: a.currentValue, invested: a.invested, gainLoss: a.gainLoss, roi: a.roi,
          apy: computeApy(a.roi, months),
          hasChildren: false,
        };
      })
      .sort((a, b) => b.currentValue - a.currentValue);
  }, [drillMaker, descriptionAssets]);

  // Determine level
  const level = !drillCategory ? 1
    : !drillPlatformId ? 2
    : !isItemValuations || drillPlatformId === -1 ? 3
    : !drillAssetCategory ? 3
    : !drillMaker ? 4
    : 5;

  const currentCells =
    level === 5 ? levelFiveCells
    : level === 4 ? levelFourCells
    : level === 3 ? levelThreeCells
    : level === 2 ? levelTwoCells
    : levelOneCells;

  function handleBreadcrumbAll() {
    setDrillCategory(null); setDrillPlatformId(null); setDrillAssetCategory(null); setDrillMaker(null);
  }
  function handleBreadcrumbCategory() {
    setDrillPlatformId(null); setDrillAssetCategory(null); setDrillMaker(null);
  }
  function handleBreadcrumbPlatform() {
    setDrillAssetCategory(null); setDrillMaker(null);
  }
  function handleBreadcrumbAssetCategory() {
    setDrillMaker(null);
  }

  if (filteredPlatforms.length === 0) {
    return <p className="text-muted-foreground text-sm">No platforms to display. Try adjusting your filters.</p>;
  }

  const activePlatformName = drillPlatformId === -1 ? "All Platforms" : (drilledPlatform?.name ?? null);
  const categoryLabel = drillCategory === ALL_SENTINEL ? "All Categories" : drillCategory;

  const levelHint =
    level === 1 ? "Click a category to drill in, or expand all at once."
    : level === 2 ? "Click a platform to see its assets, or expand all at once."
    : level === 3 && isItemValuations ? "Click a group to explore by maker or brand."
    : level === 3 ? "Individual asset performance."
    : level === 4 ? "Click a maker to see individual assets."
    : "Individual asset performance.";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <nav className="flex items-center gap-1 text-sm flex-wrap" data-testid="heatmap-breadcrumb">
          <button
            className={cn("font-medium transition-colors", level === 1 ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            onClick={handleBreadcrumbAll}
            data-testid="breadcrumb-all"
          >
            All
          </button>
          {drillCategory && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <button
                className={cn("font-medium transition-colors", level === 2 ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                onClick={handleBreadcrumbCategory}
                data-testid="breadcrumb-category"
              >
                {categoryLabel}
              </button>
            </>
          )}
          {activePlatformName && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <button
                className={cn("font-medium transition-colors", level === 3 ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                onClick={handleBreadcrumbPlatform}
                data-testid="breadcrumb-platform"
              >
                {activePlatformName}
              </button>
            </>
          )}
          {drillAssetCategory !== null && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <button
                className={cn("font-medium transition-colors", level === 4 ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                onClick={handleBreadcrumbAssetCategory}
                data-testid="breadcrumb-asset-category"
              >
                {drillAssetCategory}
              </button>
            </>
          )}
          {drillMaker !== null && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-foreground" data-testid="breadcrumb-maker">
                {drillMaker}
              </span>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {level === 1 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setDrillCategory(ALL_SENTINEL)}
              data-testid="heatmap-expand-all-platforms"
            >
              All platforms
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
          {level === 2 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setDrillPlatformId(-1)}
              data-testid="heatmap-expand-all-assets"
            >
              All assets
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
          <div className="flex items-center rounded-md border p-0.5 shrink-0">
            <Button
              variant="ghost" size="sm"
              className={cn("px-2.5 py-1 h-auto text-xs font-medium rounded",
                displayMode === "pct" ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setDisplayMode("pct")}
              data-testid="portfolio-heatmap-toggle-pct"
            >
              % Return
            </Button>
            <Button
              variant="ghost" size="sm"
              className={cn("px-2.5 py-1 h-auto text-xs font-medium rounded",
                displayMode === "abs" ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setDisplayMode("abs")}
              data-testid="portfolio-heatmap-toggle-abs"
            >
              Gain/Loss
            </Button>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{levelHint}</p>

      {currentCells.length === 0 ? (
        <p className="text-muted-foreground text-sm">No data available at this level.</p>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" data-testid="heatmap-grid">
          {currentCells.map((cell) => (
            <HeatCell
              key={cell.id}
              cell={cell}
              currency={currency}
              displayMode={displayMode}
              onClick={
                level === 1 ? () => { setDrillCategory(cell.id as string); }
                : level === 2 && cell.hasChildren ? () => { setDrillPlatformId(cell.id as number); }
                : level === 3 && isItemValuations ? () => { setDrillAssetCategory(cell.id as string); }
                : level === 4 ? () => { setDrillMaker(cell.id as string); }
                : undefined
              }
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(239,68,68,0.7)" }} />
          <span>Negative return</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(100,116,139,0.18)" }} />
          <span>Neutral</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(16,185,129,0.7)" }} />
          <span>Positive return</span>
        </div>
        <span className="ml-1 opacity-60">(intensity = magnitude)</span>
      </div>
    </div>
  );
}
