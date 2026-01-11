import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { 
  SiBinance, SiCoinbase, SiBitcoin, SiEthereum,
  SiRobinhood, SiPaypal, SiStripe, SiVisa,
  SiMastercard, SiApple, SiGoogle, SiAmazon,
  SiTesla, SiNvidia, SiInternetcomputer
} from "react-icons/si";
import { 
  Building2, Landmark, TrendingUp, Home, Coins, 
  Wallet, CreditCard, PiggyBank, DollarSign, BarChart3,
  Briefcase, Building, Factory, Gem, Globe,
  LineChart, Receipt, BadgeDollarSign, CircleDollarSign, Banknote
} from "lucide-react";

export type IconType = {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "crypto" | "stock" | "bank" | "real-estate" | "generic";
};

export const PLATFORM_ICONS: IconType[] = [
  { id: "binance", name: "Binance", icon: SiBinance, category: "crypto" },
  { id: "coinbase", name: "Coinbase", icon: SiCoinbase, category: "crypto" },
  { id: "bitcoin", name: "Bitcoin", icon: SiBitcoin, category: "crypto" },
  { id: "ethereum", name: "Ethereum", icon: SiEthereum, category: "crypto" },
  { id: "internet-computer", name: "ICP", icon: SiInternetcomputer, category: "crypto" },
  { id: "robinhood", name: "Robinhood", icon: SiRobinhood, category: "stock" },
  { id: "apple", name: "Apple", icon: SiApple, category: "stock" },
  { id: "google", name: "Google", icon: SiGoogle, category: "stock" },
  { id: "amazon", name: "Amazon", icon: SiAmazon, category: "stock" },
  { id: "tesla", name: "Tesla", icon: SiTesla, category: "stock" },
  { id: "nvidia", name: "Nvidia", icon: SiNvidia, category: "stock" },
  { id: "paypal", name: "PayPal", icon: SiPaypal, category: "bank" },
  { id: "stripe", name: "Stripe", icon: SiStripe, category: "bank" },
  { id: "visa", name: "Visa", icon: SiVisa, category: "bank" },
  { id: "mastercard", name: "Mastercard", icon: SiMastercard, category: "bank" },
  { id: "bank", name: "Bank", icon: Landmark, category: "bank" },
  { id: "credit-card", name: "Card", icon: CreditCard, category: "bank" },
  { id: "piggy-bank", name: "Savings", icon: PiggyBank, category: "bank" },
  { id: "receipt", name: "Receipt", icon: Receipt, category: "bank" },
  { id: "banknote", name: "Banknote", icon: Banknote, category: "bank" },
  { id: "building", name: "Building", icon: Building2, category: "real-estate" },
  { id: "home", name: "Home", icon: Home, category: "real-estate" },
  { id: "factory", name: "Factory", icon: Factory, category: "real-estate" },
  { id: "office", name: "Office", icon: Building, category: "real-estate" },
  { id: "coins", name: "Coins", icon: Coins, category: "crypto" },
  { id: "wallet", name: "Wallet", icon: Wallet, category: "generic" },
  { id: "dollar", name: "Dollar", icon: DollarSign, category: "generic" },
  { id: "chart", name: "Chart", icon: BarChart3, category: "stock" },
  { id: "briefcase", name: "Briefcase", icon: Briefcase, category: "generic" },
  { id: "gem", name: "Gem", icon: Gem, category: "generic" },
  { id: "globe", name: "Global", icon: Globe, category: "generic" },
  { id: "line-chart", name: "Growth", icon: LineChart, category: "stock" },
  { id: "badge-dollar", name: "Badge", icon: BadgeDollarSign, category: "generic" },
  { id: "circle-dollar", name: "Circle $", icon: CircleDollarSign, category: "generic" },
  { id: "trending", name: "Trending", icon: TrendingUp, category: "stock" },
];

export function getIconById(id: string | null | undefined): IconType | undefined {
  if (!id) return undefined;
  return PLATFORM_ICONS.find(icon => icon.id === id);
}

interface PlatformIconPickerProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  color?: string;
}

export function PlatformIconPicker({ value, onChange, color = "#3b82f6" }: PlatformIconPickerProps) {
  const [open, setOpen] = useState(false);
  const selectedIcon = getIconById(value);

  const categories = [
    { id: "crypto", label: "Crypto" },
    { id: "stock", label: "Stocks" },
    { id: "bank", label: "Banking" },
    { id: "real-estate", label: "Real Estate" },
    { id: "generic", label: "Generic" },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          data-testid="button-icon-picker"
        >
          {selectedIcon ? (
            <>
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: color }}
              >
                <selectedIcon.icon className="w-4 h-4 text-white" />
              </div>
              <span>{selectedIcon.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Select an icon...</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          {categories.map(category => {
            const icons = PLATFORM_ICONS.filter(i => i.category === category.id);
            return (
              <div key={category.id}>
                <p className="text-xs font-medium text-muted-foreground mb-2">{category.label}</p>
                <div className="flex flex-wrap gap-1">
                  {icons.map(icon => (
                    <button
                      key={icon.id}
                      onClick={() => {
                        onChange(icon.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-9 h-9 rounded-md flex items-center justify-center transition-all hover-elevate",
                        value === icon.id ? "ring-2 ring-primary" : ""
                      )}
                      style={{ backgroundColor: color }}
                      title={icon.name}
                      data-testid={`icon-option-${icon.id}`}
                    >
                      <icon.icon className="w-4 h-4 text-white" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
