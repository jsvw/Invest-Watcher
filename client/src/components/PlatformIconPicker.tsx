import { useState, useRef } from "react";
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
  LineChart, Receipt, BadgeDollarSign, CircleDollarSign, Banknote,
  Upload, Image, Loader2, X
} from "lucide-react";
import { useUpload } from "@/hooks/use-upload";

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
  customIconUrl?: string | null;
  onCustomIconChange?: (url: string | null) => void;
  color?: string;
}

export function PlatformIconPicker({ 
  value, 
  onChange, 
  customIconUrl,
  onCustomIconChange,
  color = "#3b82f6" 
}: PlatformIconPickerProps) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedIcon = getIconById(value);
  
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      const publicUrl = response.objectPath.startsWith("/objects/") 
        ? response.objectPath 
        : "/objects" + (response.objectPath.startsWith("/") ? "" : "/") + response.objectPath;
      onCustomIconChange?.(publicUrl);
      onChange("custom");
      setOpen(false);
    },
    onError: (error) => {
      console.error("Upload failed:", error);
    }
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      console.error("Please select an image file");
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      console.error("File size must be less than 5MB");
      return;
    }
    
    await uploadFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveCustomIcon = () => {
    onCustomIconChange?.(null);
    if (value === "custom") {
      onChange("");
    }
  };

  const categories = [
    { id: "crypto", label: "Crypto" },
    { id: "stock", label: "Stocks" },
    { id: "bank", label: "Banking" },
    { id: "real-estate", label: "Real Estate" },
    { id: "generic", label: "Generic" },
  ];

  const hasCustomIcon = value === "custom" && customIconUrl;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          data-testid="button-icon-picker"
        >
          {hasCustomIcon ? (
            <>
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: color }}
              >
                <img 
                  src={customIconUrl} 
                  alt="Custom icon" 
                  className="w-full h-full object-cover"
                />
              </div>
              <span>Custom Icon</span>
            </>
          ) : selectedIcon ? (
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
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Custom Upload</p>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-custom-icon"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex-1"
                data-testid="button-upload-icon"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Image
                  </>
                )}
              </Button>
              {hasCustomIcon && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveCustomIcon}
                  data-testid="button-remove-custom-icon"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            {hasCustomIcon && (
              <div className="mt-2 flex items-center gap-2">
                <div 
                  className="w-9 h-9 rounded-md flex items-center justify-center overflow-hidden ring-2 ring-primary"
                  style={{ backgroundColor: color }}
                >
                  <img 
                    src={customIconUrl} 
                    alt="Custom icon" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-xs text-muted-foreground">Current custom icon</span>
              </div>
            )}
          </div>
          
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Or choose from library</p>
          </div>
          
          {categories.map(category => {
            const icons = PLATFORM_ICONS.filter(i => i.category === category.id);
            return (
              <div key={category.id}>
                <p className="text-xs font-medium text-muted-foreground mb-2">{category.label}</p>
                <div className="flex flex-wrap gap-1">
                  {icons.map(icon => (
                    <button
                      key={icon.id}
                      type="button"
                      onClick={() => {
                        onChange(icon.id);
                        if (onCustomIconChange) {
                          onCustomIconChange(null);
                        }
                        setOpen(false);
                      }}
                      className={cn(
                        "w-9 h-9 rounded-md flex items-center justify-center transition-all hover-elevate",
                        value === icon.id && !hasCustomIcon ? "ring-2 ring-primary" : ""
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
