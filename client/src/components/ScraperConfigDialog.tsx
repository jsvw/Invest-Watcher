import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Globe, Loader2, Settings2, CheckCircle, XCircle, Trash2 } from "lucide-react";

interface ScraperConfigDialogProps {
  platformId: number;
  platformName: string;
}

export function ScraperConfigDialog({ platformId, platformName }: ScraperConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['/api/platforms', platformId, 'scraper-config'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${platformId}/scraper-config`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch scraper config");
      return res.json();
    },
    enabled: open,
  });

  const saveConfig = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/platforms/${platformId}/scraper-config`, {
        scraperType: "monefit",
        email,
        password,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'scraper-config'] });
      toast({ title: "Scraper credentials saved" });
      setEmail("");
      setPassword("");
    },
    onError: () => {
      toast({ title: "Failed to save credentials", variant: "destructive" });
    },
  });

  const deleteConfig = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/platforms/${platformId}/scraper-config`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'scraper-config'] });
      toast({ title: "Scraper configuration removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove configuration", variant: "destructive" });
    },
  });

  const runScrape = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/platforms/${platformId}/scrape`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Scraping failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'scraper-config'] });
      queryClient.invalidateQueries({ queryKey: ['/api/valuations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms'] });
      toast({ title: data.message || "Scraping complete" });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'scraper-config'] });
      toast({ title: `Scraping failed: ${err.message}`, variant: "destructive" });
    },
  });

  const hasConfig = config && config.id;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-scraper-config">
          <Globe className="h-4 w-4 mr-1" />
          Web Scraper
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Web Scraper - {platformName}
          </DialogTitle>
          <DialogDescription>
            Automatically fetch your latest balance from the platform website.
          </DialogDescription>
        </DialogHeader>

        {configLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : hasConfig ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/50">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <span className="text-sm truncate">Scraper configured</span>
              </div>
              <Badge variant="secondary">{config.scraperType}</Badge>
            </div>

            {config.lastScrapeAt && (
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <span>Last run:</span>
                  <span>{new Date(config.lastScrapeAt).toLocaleString()}</span>
                </div>
                {config.lastScrapeStatus && (
                  <div className="flex items-center gap-2">
                    <span>Status:</span>
                    {config.lastScrapeStatus === "success" ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" /> Success
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 border-red-600">
                        <XCircle className="h-3 w-3 mr-1" /> Error
                      </Badge>
                    )}
                  </div>
                )}
                {config.lastScrapeMessage && (
                  <p className="text-xs bg-muted p-2 rounded">{config.lastScrapeMessage}</p>
                )}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => runScrape.mutate()}
                disabled={runScrape.isPending}
                data-testid="button-run-scrape"
              >
                {runScrape.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-1" />
                    Scrape Now
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteConfig.mutate()}
                disabled={deleteConfig.isPending}
                data-testid="button-delete-scraper"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove
              </Button>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Update credentials</p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="scraper-email">Email</Label>
                  <Input
                    id="scraper-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    data-testid="input-scraper-email"
                  />
                </div>
                <div>
                  <Label htmlFor="scraper-password">Password</Label>
                  <Input
                    id="scraper-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Your platform password"
                    data-testid="input-scraper-password"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => saveConfig.mutate()}
                  disabled={saveConfig.isPending || !email || !password}
                  data-testid="button-update-credentials"
                >
                  {saveConfig.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Update Credentials
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your Monefit login credentials to enable automatic balance scraping. 
              Your credentials are stored securely and only used to log into the platform.
            </p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="scraper-email-new">Email</Label>
                <Input
                  id="scraper-email-new"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  data-testid="input-scraper-email-new"
                />
              </div>
              <div>
                <Label htmlFor="scraper-password-new">Password</Label>
                <Input
                  id="scraper-password-new"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your platform password"
                  data-testid="input-scraper-password-new"
                />
              </div>
              <Button
                onClick={() => saveConfig.mutate()}
                disabled={saveConfig.isPending || !email || !password}
                className="w-full"
                data-testid="button-save-credentials"
              >
                {saveConfig.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Save Credentials & Enable Scraper
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
