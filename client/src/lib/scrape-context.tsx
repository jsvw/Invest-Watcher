import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

interface ScrapeEntry {
  id: string;
  label: string;
}

interface ScrapeOutcome {
  label: string;
  success: boolean;
}

interface ScrapeContextType {
  activeScrapes: ScrapeEntry[];
  startScrape: (id: string, label: string) => void;
  endScrape: (id: string, success?: boolean) => void;
}

const ScrapeContext = createContext<ScrapeContextType>({
  activeScrapes: [],
  startScrape: () => {},
  endScrape: () => {},
});

export function useScrapeStatus() {
  return useContext(ScrapeContext);
}

export function ScrapeProvider({ children }: { children: React.ReactNode }) {
  const [activeScrapes, setActiveScrapes] = useState<ScrapeEntry[]>([]);
  const outcomesRef = useRef<ScrapeOutcome[]>([]);
  const hadActiveScrapes = useRef(false);
  const { toast } = useToast();

  const startScrape = useCallback((id: string, label: string) => {
    setActiveScrapes(prev => {
      if (prev.some(s => s.id === id)) return prev;
      hadActiveScrapes.current = true;
      return [...prev, { id, label }];
    });
  }, []);

  const endScrape = useCallback((id: string, success = true) => {
    setActiveScrapes(prev => {
      const entry = prev.find(s => s.id === id);
      if (entry) {
        outcomesRef.current = [...outcomesRef.current, { label: entry.label, success }];
      }
      return prev.filter(s => s.id !== id);
    });
  }, []);

  useEffect(() => {
    if (!hadActiveScrapes.current || activeScrapes.length > 0) return;
    if (outcomesRef.current.length === 0) return;

    const outcomes = outcomesRef.current;
    outcomesRef.current = [];
    hadActiveScrapes.current = false;

    const failedCount = outcomes.filter(o => !o.success).length;
    const successCount = outcomes.filter(o => o.success).length;

    if (failedCount === 0) {
      toast({
        title:
          outcomes.length === 1
            ? `${outcomes[0].label} scraped successfully`
            : `All ${outcomes.length} platform scrapes completed`,
      });
    } else if (successCount === 0) {
      toast({
        title:
          outcomes.length === 1
            ? `Scraping ${outcomes[0].label} failed`
            : `All ${outcomes.length} scrapes failed`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Scraping completed with errors",
        description: `${successCount} succeeded, ${failedCount} failed`,
        variant: "destructive",
      });
    }
  }, [activeScrapes, toast]);

  return (
    <ScrapeContext.Provider value={{ activeScrapes, startScrape, endScrape }}>
      {children}
    </ScrapeContext.Provider>
  );
}
