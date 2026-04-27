import { createContext, useContext, useState, useCallback } from "react";

interface ScrapeEntry {
  id: string;
  label: string;
}

interface ScrapeContextType {
  activeScrapes: ScrapeEntry[];
  startScrape: (id: string, label: string) => void;
  endScrape: (id: string) => void;
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

  const startScrape = useCallback((id: string, label: string) => {
    setActiveScrapes(prev =>
      prev.some(s => s.id === id) ? prev : [...prev, { id, label }]
    );
  }, []);

  const endScrape = useCallback((id: string) => {
    setActiveScrapes(prev => prev.filter(s => s.id !== id));
  }, []);

  return (
    <ScrapeContext.Provider value={{ activeScrapes, startScrape, endScrape }}>
      {children}
    </ScrapeContext.Provider>
  );
}
