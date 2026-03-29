import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompactCurrency } from "@/lib/currency";
import type { PlatformResponse } from "@shared/schema";
import { Button } from "@/components/ui/button";

export interface EnrichedAsset {
  assetId: number;
  assetName: string;
  platformId: number;
  platformName: string;
  category: string;
  currentValue: number;
  invested: number;
  gainLoss: number;
  roi: number;
}

interface HeatmapCell {
  id: string | number;
  label: string;
  currentValue: number;
  invested: number;
  gainLoss: number;
  roi: number;
  hasChildren: boolean;
}

type DisplayMode = "pct" | "abs";

interface PortfolioHeatmapProps {
  assets: EnrichedAsset[];
  platforms: PlatformResponse[];
  excludedPlatforms: Set<number>;
  currency: string;
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
        <div className="text-[10px] opacity-80">
          {formatCompactCurrency(cell.currentValue, currency)} / {formatCompactCurrency(cell.invested, currency)} invested
        </div>
      </div>
    </div>
  );
}

export function PortfolioHeatmap({ assets, platforms, excludedPlatforms, currency }: PortfolioHeatmapProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("pct");
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [drillPlatformId, setDrillPlatformId] = useState<number | null>(null);

  const filteredAssets = useMemo(
    () => assets.filter((a) => !excludedPlatforms.has(a.platformId)),
    [assets, excludedPlatforms]
  );

  const filteredPlatforms = useMemo(
    () => platforms.filter((p) => !excludedPlatforms.has(p.id)),
    [platforms, excludedPlatforms]
  );

  // Level 1: categories — aggregated from platform totals.
  // Platform-level currentValue and totalInvested are the single source of truth for all modes
  // (standard, asset_returns, item_valuations) and are already computed by the backend.
  const categoryMap = useMemo(() => {
    const map = new Map<string, { currentValue: number; invested: number }>();
    for (const p of filteredPlatforms) {
      const cat = p.category;
      const existing = map.get(cat) ?? { currentValue: 0, invested: 0 };
      existing.currentValue += Number(p.currentValue) || 0;
      existing.invested += Number(p.totalInvested) || 0;
      map.set(cat, existing);
    }
    return map;
  }, [filteredPlatforms]);

  const levelOneCells = useMemo((): HeatmapCell[] => {
    const cells: HeatmapCell[] = [];
    for (const [cat, data] of categoryMap.entries()) {
      const gainLoss = data.currentValue - data.invested;
      const roi = data.invested > 0 ? (gainLoss / data.invested) * 100 : 0;
      cells.push({
        id: cat,
        label: cat,
        currentValue: data.currentValue,
        invested: data.invested,
        gainLoss,
        roi,
        hasChildren: true,
      });
    }
    return cells.sort((a, b) => b.currentValue - a.currentValue);
  }, [categoryMap]);

  // Level 2: platforms within selected category
  const levelTwoCells = useMemo((): HeatmapCell[] => {
    if (!drillCategory) return [];
    const inCategory = filteredPlatforms.filter((p) => p.category === drillCategory);
    return inCategory.map((p) => {
      const currentValue = Number(p.currentValue) || 0;
      const invested = Number(p.totalInvested) || 0;
      const gainLoss = currentValue - invested;
      const roi = invested > 0 ? (gainLoss / invested) * 100 : 0;
      // Only platforms with asset-level modes have drillable Level 3
      const hasChildren = p.platformMode === "asset_returns" || p.platformMode === "item_valuations";
      return {
        id: p.id,
        label: p.name,
        currentValue,
        invested,
        gainLoss,
        roi,
        hasChildren,
      };
    }).sort((a, b) => b.currentValue - a.currentValue);
  }, [drillCategory, filteredPlatforms]);

  // Level 3: individual assets within selected platform
  const levelThreeCells = useMemo((): HeatmapCell[] => {
    if (!drillPlatformId) return [];
    const inPlatform = filteredAssets.filter((a) => a.platformId === drillPlatformId);
    return inPlatform.map((a) => ({
      id: a.assetId,
      label: a.assetName,
      currentValue: a.currentValue,
      invested: a.invested,
      gainLoss: a.gainLoss,
      roi: a.roi,
      hasChildren: false,
    })).sort((a, b) => b.currentValue - a.currentValue);
  }, [drillPlatformId, filteredAssets]);

  // Determine current level and cells
  const level = drillPlatformId ? 3 : drillCategory ? 2 : 1;
  const currentCells = level === 3 ? levelThreeCells : level === 2 ? levelTwoCells : levelOneCells;

  function handleCategoryClick(cat: string) {
    setDrillCategory(cat);
    setDrillPlatformId(null);
  }

  function handlePlatformClick(platformId: number) {
    setDrillPlatformId(platformId);
  }

  function handleBreadcrumbAll() {
    setDrillCategory(null);
    setDrillPlatformId(null);
  }

  function handleBreadcrumbCategory() {
    setDrillPlatformId(null);
  }

  const activePlatformName = drillPlatformId
    ? platforms.find((p) => p.id === drillPlatformId)?.name ?? ""
    : null;

  if (filteredPlatforms.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No platforms to display. Try adjusting your filters.</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm flex-wrap" data-testid="heatmap-breadcrumb">
          <button
            className={cn(
              "font-medium transition-colors",
              level === 1 ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={handleBreadcrumbAll}
            data-testid="breadcrumb-all"
          >
            All
          </button>
          {drillCategory && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <button
                className={cn(
                  "font-medium transition-colors",
                  level === 2 ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={handleBreadcrumbCategory}
                data-testid="breadcrumb-category"
              >
                {drillCategory}
              </button>
            </>
          )}
          {activePlatformName && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-foreground" data-testid="breadcrumb-platform">
                {activePlatformName}
              </span>
            </>
          )}
        </nav>

        {/* Display mode toggle */}
        <div className="flex items-center rounded-md border p-0.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "px-2.5 py-1 h-auto text-xs font-medium rounded",
              displayMode === "pct"
                ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setDisplayMode("pct")}
            data-testid="portfolio-heatmap-toggle-pct"
          >
            % Return
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "px-2.5 py-1 h-auto text-xs font-medium rounded",
              displayMode === "abs"
                ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setDisplayMode("abs")}
            data-testid="portfolio-heatmap-toggle-abs"
          >
            Gain/Loss
          </Button>
        </div>
      </div>

      {/* Level label */}
      <p className="text-xs text-muted-foreground">
        {level === 1 && "Click a category to drill down into its platforms."}
        {level === 2 && "Click a platform to see individual assets (where available)."}
        {level === 3 && "Individual asset performance."}
      </p>

      {/* Grid */}
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
                level === 1
                  ? () => handleCategoryClick(cell.id as string)
                  : level === 2 && cell.hasChildren
                  ? () => handlePlatformClick(cell.id as number)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Color legend */}
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
