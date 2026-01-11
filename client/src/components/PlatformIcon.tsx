import { getIconById } from "./PlatformIconPicker";
import { cn } from "@/lib/utils";

interface PlatformIconProps {
  icon?: string | null;
  customIconUrl?: string | null;
  color: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "w-6 h-6 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
  xl: "w-12 h-12 text-base",
};

const iconSizeClasses = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-5 h-5",
  xl: "w-6 h-6",
};

export function PlatformIcon({ 
  icon, 
  customIconUrl, 
  color, 
  name, 
  size = "md",
  className 
}: PlatformIconProps) {
  const hasCustomIcon = icon === "custom" && customIconUrl;
  const iconInfo = getIconById(icon);
  const IconComponent = iconInfo?.icon;

  return (
    <div 
      className={cn(
        "rounded-full flex items-center justify-center text-white font-bold overflow-hidden",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: color }}
    >
      {hasCustomIcon ? (
        <img 
          src={customIconUrl} 
          alt={name} 
          className="w-full h-full object-cover"
        />
      ) : IconComponent ? (
        <IconComponent className={cn("text-white", iconSizeClasses[size])} />
      ) : (
        <span>{name.charAt(0)}</span>
      )}
    </div>
  );
}
