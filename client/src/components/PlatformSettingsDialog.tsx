import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { useUpdatePlatform, useDeletePlatform } from "@/hooks/use-platforms";
import { useState } from "react";
import { Settings, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import type { Platform } from "@shared/schema";
import { PlatformIconPicker } from "./PlatformIconPicker";

interface PlatformFormData {
  name: string;
  description: string;
  category: string;
  currency: string;
  color: string;
  icon: string;
  customIconUrl: string | null;
  platformMode: string;
  allowPendingDeposits: boolean;
}

const TRACKING_MODES = [
  { value: "standard", label: "Standard", description: "Track platform-level investments and valuations" },
  { value: "asset_returns", label: "Asset Returns", description: "Track individual assets with annual yields" },
  { value: "item_valuations", label: "Item Valuations", description: "Track items with periodic value updates" },
];

const CATEGORIES = ["Crypto", "Stock", "Bank", "Real Estate", "Retirement", "Other"];
const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD"];
const COLORS = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#10b981", label: "Green" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Red" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#6366f1", label: "Indigo" },
];

interface PlatformSettingsDialogProps {
  platform: Platform;
}

export function PlatformSettingsDialog({ platform }: PlatformSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const updateMutation = useUpdatePlatform();
  const deleteMutation = useDeletePlatform();

  const form = useForm<PlatformFormData>({
    defaultValues: {
      name: platform.name || "",
      description: platform.description || "",
      category: platform.category || "Other",
      currency: (platform as any).currency || "USD",
      color: platform.color || "#3b82f6",
      icon: (platform as any).icon || "",
      customIconUrl: (platform as any).customIconUrl || null,
      platformMode: (platform as any).platformMode || "standard",
      allowPendingDeposits: (platform as any).allowPendingDeposits ?? false,
    },
  });

  const onSubmit = (data: PlatformFormData) => {
    updateMutation.mutate(
      { id: platform.id, data },
      {
        onSuccess: () => {
          setOpen(false);
        },
      }
    );
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this platform? This will delete all investments, valuations, and assets. This action cannot be undone.")) {
      deleteMutation.mutate(platform.id, {
        onSuccess: () => {
          setOpen(false);
          setLocation("/platforms");
        },
      });
    }
  };

  const isPending = updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" data-testid="button-platform-settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Platform Settings</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input 
              id="name" 
              {...form.register("name")} 
              data-testid="input-platform-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input 
              id="description" 
              {...form.register("description")} 
              data-testid="input-platform-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select 
              value={form.watch("category")} 
              onValueChange={(value) => form.setValue("category", value)}
            >
              <SelectTrigger data-testid="select-platform-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select 
              value={form.watch("currency")} 
              onValueChange={(value) => form.setValue("currency", value)}
            >
              <SelectTrigger data-testid="select-platform-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((cur) => (
                  <SelectItem key={cur} value={cur}>{cur}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="platformMode">Tracking Mode</Label>
            <Select 
              value={form.watch("platformMode")} 
              onValueChange={(value) => form.setValue("platformMode", value)}
            >
              <SelectTrigger data-testid="select-platform-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRACKING_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    <div>
                      <span className="font-medium">{mode.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{mode.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Allow pending deposits</Label>
              <p className="text-xs text-muted-foreground">Show "Awaiting settlement" checkbox when logging investments</p>
            </div>
            <Switch
              checked={form.watch("allowPendingDeposits")}
              onCheckedChange={(val) => form.setValue("allowPendingDeposits", val)}
              data-testid="switch-allow-pending-deposits"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <Select 
              value={form.watch("color")} 
              onValueChange={(value) => form.setValue("color", value)}
            >
              <SelectTrigger data-testid="select-platform-color">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLORS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: c.value }} />
                      {c.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <PlatformIconPicker 
              value={form.watch("icon")} 
              onChange={(val) => form.setValue("icon", val)}
              customIconUrl={form.watch("customIconUrl")}
              onCustomIconChange={(url) => form.setValue("customIconUrl", url)}
              color={form.watch("color")}
            />
          </div>

          <div className="pt-4 flex justify-between">
            <Button 
              type="button" 
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-platform"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleteMutation.isPending ? "Deleting..." : "Delete Platform"}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-platform">
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
