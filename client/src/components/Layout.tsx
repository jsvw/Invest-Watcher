import { Link, useLocation } from "wouter";
import { LayoutDashboard, TrendingUp, Menu, X, LogOut, Settings, Coffee, Plus, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/App";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { APP_VERSION } from "@/lib/version";
import { usePlatforms } from "@/hooks/use-platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { AddPlatformDialog } from "@/components/AddPlatformDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
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

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
  ];

  return (
    <div className="h-screen bg-background flex flex-col md:flex-row overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-2 font-display text-xl font-bold text-primary">
          <TrendingUp className="h-6 w-6" />
          <span>InvestTrack</span>
        </div>
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
          <div className="flex items-center gap-2 font-display text-2xl font-bold text-primary mb-8">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative shrink-0 cursor-default">
                  <TrendingUp className="h-8 w-8" />
                  {hasStaleValuation && (
                    <AlertTriangle
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 text-amber-500"
                      data-testid="icon-stale-valuation-warning"
                    />
                  )}
                </div>
              </TooltipTrigger>
              {hasStaleValuation && (
                <TooltipContent side="right">
                  <p>Some platforms haven't been updated in over 31 days</p>
                </TooltipContent>
              )}
            </Tooltip>
            <span>InvestTrack</span>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}>
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Platform icon grid */}
          <div className="mt-6">
            <p className="text-xs font-medium text-muted-foreground px-1 mb-2 uppercase tracking-wider">Platforms</p>
            <div className="grid grid-cols-3 gap-1.5">
              {platforms?.map((p) => {
                const stale = isPlatformStale(p.lastValuationDate);
                return (
                  <Tooltip key={p.id}>
                    <TooltipTrigger asChild>
                      <Link href={`/platforms/${encodeURIComponent(p.name.toLowerCase().replace(/\s+/g, '-'))}`}>
                        <div
                          data-testid={`sidebar-platform-${p.id}`}
                          className="relative flex items-center justify-center p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
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
                      {stale && <p className="text-amber-400 text-xs">No valuation in 31+ days</p>}
                    </TooltipContent>
                  </Tooltip>
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
        </div>

        {/* Fixed bottom section */}
        <div className="p-6 border-t space-y-4 flex-shrink-0">
          {user && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              <div className="flex items-center gap-1 shrink-0">
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
          <a
            href="https://buymeacoffee.com/investmenttracker"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl p-4 border border-amber-500/30 transition-colors"
            data-testid="link-buy-me-coffee"
          >
            <Coffee className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-sm text-amber-600 dark:text-amber-400">Buy me a coffee</h4>
              <p className="text-xs text-muted-foreground">Support this project</p>
            </div>
          </a>
          <div className="text-center text-xs text-muted-foreground/60" data-testid="text-app-version">
            v{APP_VERSION}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto md:h-screen bg-background/50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
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
