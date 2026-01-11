import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPlatformSchema } from "@shared/schema";
import { useCreatePlatform } from "@/hooks/use-platforms";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { InsertPlatform } from "@shared/routes";

const categories = ["Crypto", "Stock", "Real Estate", "Bank", "Commodities", "Loans", "Other"];
const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#6366f1"];
const currencies = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "GBP", label: "GBP (£)" },
  { value: "JPY", label: "JPY (¥)" },
  { value: "CAD", label: "CAD ($)" },
  { value: "AUD", label: "AUD ($)" },
  { value: "BRL", label: "BRL (R$)" },
];
const platformModes = [
  { value: "standard", label: "Standard", description: "Track platform-level investments and valuations" },
  { value: "asset_returns", label: "Assets with Returns", description: "Individual assets with invested amount and annual yield (real estate, loans)" },
  { value: "item_valuations", label: "Items with Valuations", description: "Individual items with periodic valuation updates (collectibles, crypto)" },
];

export function AddPlatformDialog() {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useCreatePlatform();

  const form = useForm<InsertPlatform>({
    resolver: zodResolver(insertPlatformSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "Stock",
      color: "#3b82f6",
      currency: "USD",
      platformMode: "standard",
    },
  });

  const onSubmit = (data: InsertPlatform) => {
    mutate(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
          <Plus className="h-4 w-4" /> Add Platform
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Platform</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Platform Name</Label>
            <Input id="name" {...form.register("name")} placeholder="e.g. Coinbase, Vanguard" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select 
              onValueChange={(value) => form.setValue("category", value)}
              defaultValue={form.getValues("category")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select 
              onValueChange={(value) => form.setValue("currency", value)}
              defaultValue={form.getValues("currency")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((curr) => (
                  <SelectItem key={curr.value} value={curr.value}>{curr.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="platformMode">Tracking Mode</Label>
            <Select 
              onValueChange={(value) => form.setValue("platformMode", value)}
              defaultValue={form.getValues("platformMode")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select tracking mode" />
              </SelectTrigger>
              <SelectContent>
                {platformModes.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    <div className="flex flex-col">
                      <span>{mode.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {platformModes.find(m => m.value === form.watch("platformMode"))?.description}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input id="description" {...form.register("description")} placeholder="Main investment account" />
          </div>

          <div className="space-y-2">
            <Label>Color Code</Label>
            <div className="flex gap-2 flex-wrap">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    form.watch("color") === color ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => form.setValue("color", color)}
                />
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Platform"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
