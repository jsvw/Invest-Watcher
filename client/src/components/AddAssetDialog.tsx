import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { useCreateAsset, useUpdateAsset } from "@/hooks/use-assets";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import type { Asset } from "@shared/schema";

interface AssetFormData {
  platformId: number;
  name: string;
  description: string;
  investedAmount: string;
  annualYield: string;
  acquisitionDate: string;
  exitDate: string;
}

interface AddAssetDialogProps {
  platformId: number;
  mode: "asset_returns" | "item_valuations";
  editAsset?: Asset;
}

export function AddAssetDialog({ platformId, mode, editAsset }: AddAssetDialogProps) {
  const [open, setOpen] = useState(false);
  const createMutation = useCreateAsset(platformId);
  const updateMutation = useUpdateAsset(platformId);
  const isEdit = !!editAsset;

  const form = useForm<AssetFormData>({
    defaultValues: {
      platformId,
      name: editAsset?.name || "",
      description: editAsset?.description || "",
      investedAmount: editAsset?.investedAmount || "",
      annualYield: editAsset?.annualYield || "",
      acquisitionDate: editAsset?.acquisitionDate 
        ? new Date(editAsset.acquisitionDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      exitDate: editAsset?.exitDate 
        ? new Date(editAsset.exitDate).toISOString().split('T')[0]
        : "",
    },
  });

  const onSubmit = (data: AssetFormData) => {
    const payload = {
      name: data.name || "",
      platformId,
      investedAmount: data.investedAmount || "0",
      annualYield: data.annualYield || null,
      description: data.description || null,
      acquisitionDate: data.acquisitionDate,
      exitDate: data.exitDate || null,
    };

    if (isEdit && editAsset) {
      updateMutation.mutate(
        { id: editAsset.id, data: payload },
        {
          onSuccess: () => {
            setOpen(false);
            form.reset();
          },
        }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          setOpen(false);
          form.reset();
        },
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button size="sm" variant="ghost" data-testid={`button-edit-asset-${editAsset?.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="gap-2" data-testid="button-add-asset">
            <Plus className="h-4 w-4" /> Add {mode === "asset_returns" ? "Asset" : "Item"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit" : "Add"} {mode === "asset_returns" ? "Asset" : "Item"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input 
              id="name" 
              {...form.register("name")} 
              placeholder={mode === "asset_returns" ? "e.g. Property at 123 Main St" : "e.g. Vintage Watch"} 
              data-testid="input-asset-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input 
              id="description" 
              {...form.register("description")} 
              placeholder="Additional details" 
              data-testid="input-asset-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="investedAmount">Invested Amount</Label>
            <Input 
              id="investedAmount" 
              type="number" 
              step="0.01"
              {...form.register("investedAmount")} 
              placeholder="0.00" 
              data-testid="input-asset-invested"
            />
          </div>

          {mode === "asset_returns" && (
            <div className="space-y-2">
              <Label htmlFor="annualYield">Annual Yield (%)</Label>
              <Input 
                id="annualYield" 
                type="number" 
                step="0.01"
                {...form.register("annualYield")} 
                placeholder="e.g. 8.5" 
                data-testid="input-asset-yield"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="acquisitionDate">Acquisition Date</Label>
            <Input 
              id="acquisitionDate" 
              type="date" 
              {...form.register("acquisitionDate")} 
              data-testid="input-asset-date"
            />
          </div>

          {mode === "asset_returns" && (
            <div className="space-y-2">
              <Label htmlFor="exitDate">Exit/Maturity Date (Optional)</Label>
              <Input 
                id="exitDate" 
                type="date" 
                {...form.register("exitDate")} 
                data-testid="input-asset-exit-date"
              />
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending} data-testid="button-submit-asset">
              {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
