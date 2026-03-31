import { Link } from "wouter";
import { Menu, X, LogOut, Settings, Plus, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/App";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePlatforms } from "@/hooks/use-platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { AddPlatformDialog } from "@/components/AddPlatformDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Layout({ children, sidebarExtra, platformFilter }: {
  children: React.ReactNode;
  sidebarExtra?: React.ReactNode;
  platformFilter?: { excludedPlatforms: Set<number>; onToggle: (id: number) => void };
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const { data: platforms } = usePlatforms();

  const thirtyOneDaysAgo = new Date();
  thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

  const isPlatformStale = (lastValuationDate: string | null | undefined) => {
    if (!lastValuationDate) return true;
    return new Date(lastValuationDate) < thirtyOneDaysAgo;
  };

  const hasStaleValuation = (() => {
    if (!platforms || platforms.length === 0) return false;
    const latestDate = platforms
      .map(p => p.lastValuationDate ? new Date(p.lastValuationDate) : null)
      .filter((d): d is Date => d !== null)
      .reduce<Date | null>((max, d) => (max === null || d > max ? d : max), null);
    return latestDate === null || latestDate < thirtyOneDaysAgo;
  })();

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      queryClient.clear();
      window.location.href = "/login";
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col md:flex-row overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-end p-4 border-b bg-card">
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r shadow-xl transform transition-transform duration-200 ease-in-out md:translate-x-0 md:relative md:shadow-none flex flex-col h-full",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Scrollable top section */}
        <div className="flex-1 overflow-y-auto p-6">
          {hasStaleValuation && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 mb-4 px-1 text-amber-500 cursor-default">
                  <AlertTriangle className="h-4 w-4 shrink-0" data-testid="icon-stale-valuation-warning" />
                  <span className="text-xs font-medium">Some platforms are stale</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Some platforms haven't been updated in over 31 days</p>
              </TooltipContent>
            </Tooltip>
          )}


          {/* Platform icon grid */}
          <div className="mt-6">
            <div className="grid grid-cols-3 gap-1.5">
              {platforms?.map((p) => {
                const stale = isPlatformStale(p.lastValuationDate);
                const excluded = platformFilter ? platformFilter.excludedPlatforms.has(p.id) : false;
                return (
                  <div key={p.id} className="relative">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href={`/platforms/${encodeURIComponent(p.name.toLowerCase().replace(/\s+/g, '-'))}`}>
                          <div
                            data-testid={`sidebar-platform-${p.id}`}
                            className={cn(
                              "relative flex items-center justify-center p-2 rounded-lg hover:bg-muted transition-all cursor-pointer",
                              excluded && "opacity-40"
                            )}
                          >
                            <PlatformIcon
                              icon={p.icon}
                              customIconUrl={p.customIconUrl}
                              color={p.color}
                              name={p.name}
                              size="md"
                            />
                            {stale && (
                              <AlertTriangle
                                className="absolute top-0.5 right-0.5 h-3 w-3 text-amber-500"
                                data-testid={`icon-stale-platform-${p.id}`}
                              />
                            )}
                          </div>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p className="font-medium">{p.name}</p>
                        {excluded && <p className="text-muted-foreground text-xs">Excluded from charts</p>}
                        {stale && <p className="text-amber-400 text-xs">No valuation in 31+ days</p>}
                      </TooltipContent>
                    </Tooltip>
                    {platformFilter && (
                      <button
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          platformFilter.onToggle(p.id);
                        }}
                        data-testid={`filter-platform-${p.id}`}
                        title={excluded ? `Include ${p.name}` : `Exclude ${p.name}`}
                        className="absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full border-2 border-card transition-all z-10 hover:scale-125"
                        style={{ backgroundColor: excluded ? "#888" : p.color }}
                      />
                    )}
                  </div>
                );
              })}
              <AddPlatformDialog
                trigger={
                  <div
                    title="Add Platform"
                    data-testid="sidebar-add-platform"
                    className="flex items-center justify-center p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer border border-dashed border-muted-foreground/30"
                  >
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </div>
                }
              />
            </div>
          </div>

          {sidebarExtra && (
            <div className="mt-6">
              {sidebarExtra}
            </div>
          )}
        </div>

        {/* Fixed bottom section */}
        <div className="p-6 border-t space-y-4 flex-shrink-0">
          {user && (
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm min-w-0">
                <div className="font-medium">{user.name || "User"}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
              <div className="flex items-center gap-1">
                <Link href="/settings">
                  <Button variant="ghost" size="icon" title="Settings" data-testid="button-settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  title="Log out"
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen bg-background/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
