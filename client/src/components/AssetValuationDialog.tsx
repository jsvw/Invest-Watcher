import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useCreateAssetValuation } from "@/hooks/use-assets";
import { useState } from "react";
import { TrendingUp } from "lucide-react";
import type { Asset, InsertAssetValuation } from "@shared/schema";

interface AssetValuationDialogProps {
  asset: Asset;
  platformId: number;
}

export function AssetValuationDialog({ asset, platformId }: AssetValuationDialogProps) {
  const [open, setOpen] = useState(false);
  const createMutation = useCreateAssetValuation(asset.id, platformId);

  const form = useForm<Partial<InsertAssetValuation>>({
    defaultValues: {
      assetId: asset.id,
      value: "",
      date: new Date().toISOString().split('T')[0],
      notes: "",
    },
  });

  const onSubmit = (data: Partial<InsertAssetValuation>) => {
    const payload: InsertAssetValuation = {
      assetId: asset.id,
      value: data.value!,
      date: new Date(data.date as string),
      notes: data.notes || null,
    };

    createMutation.mutate(payload, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1" data-testid={`button-value-asset-${asset.id}`}>
          <TrendingUp className="h-3 w-3" /> Update Value
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Record New Valuation</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-4">
          Updating value for: <strong>{asset.name}</strong>
        </div>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="value">Current Value</Label>
            <Input 
              id="value" 
              type="number" 
              step="0.01"
              {...form.register("value")} 
              placeholder="0.00" 
              data-testid="input-valuation-value"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Valuation Date</Label>
            <Input 
              id="date" 
              type="date" 
              {...form.register("date")} 
              data-testid="input-valuation-date"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea 
              id="notes" 
              {...form.register("notes")} 
              placeholder="Any additional notes about this valuation"
              rows={2}
              data-testid="input-valuation-notes"
            />
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-valuation">
              {createMutation.isPending ? "Saving..." : "Record Valuation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
