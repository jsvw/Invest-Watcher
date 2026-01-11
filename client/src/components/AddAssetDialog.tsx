import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { useCreateAsset, useUpdateAsset, useDeleteAsset } from "@/hooks/use-assets";
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Asset } from "@shared/schema";

interface AssetFormData {
  platformId: number;
  name: string;
  description: string;
  investedAmount: string;
  bonusAmount: string;
  annualYield: string;
  quantity: string;
  pricePerUnit: string;
  acquisitionDate: string;
  exitDate: string;
}

interface AddAssetDialogProps {
  platformId: number;
  mode: "asset_returns" | "item_valuations";
  editAsset?: Asset;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function AddAssetDialog({ platformId, mode, editAsset, open: controlledOpen, onOpenChange, trigger }: AddAssetDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const createMutation = useCreateAsset(platformId);
  const updateMutation = useUpdateAsset(platformId);
  const deleteMutation = useDeleteAsset(platformId);
  const isEdit = !!editAsset;

  const handleDelete = () => {
    if (editAsset && confirm("Are you sure you want to delete this asset? This action cannot be undone.")) {
      deleteMutation.mutate(editAsset.id, {
        onSuccess: () => setOpen(false),
      });
    }
  };

  const form = useForm<AssetFormData>({
    defaultValues: {
      platformId,
      name: editAsset?.name || "",
      description: editAsset?.description || "",
      investedAmount: editAsset?.investedAmount || "",
      bonusAmount: (editAsset as any)?.bonusAmount || "",
      annualYield: editAsset?.annualYield || "",
      quantity: (editAsset as any)?.quantity || "",
      pricePerUnit: (editAsset as any)?.pricePerUnit || "",
      acquisitionDate: editAsset?.acquisitionDate 
        ? new Date(editAsset.acquisitionDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      exitDate: editAsset?.exitDate 
        ? new Date(editAsset.exitDate).toISOString().split('T')[0]
        : "",
    },
  });

  useEffect(() => {
    if (open && isEdit && editAsset) {
      form.reset({
        platformId,
        name: editAsset.name || "",
        description: editAsset.description || "",
        investedAmount: editAsset.investedAmount || "",
        bonusAmount: (editAsset as any).bonusAmount || "",
        annualYield: editAsset.annualYield || "",
        quantity: (editAsset as any).quantity || "",
        pricePerUnit: (editAsset as any).pricePerUnit || "",
        acquisitionDate: editAsset.acquisitionDate 
          ? new Date(editAsset.acquisitionDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        exitDate: editAsset.exitDate 
          ? new Date(editAsset.exitDate).toISOString().split('T')[0]
          : "",
      });
    }
  }, [open, isEdit, editAsset, form, platformId]);

  // Watch quantity and pricePerUnit to calculate total
  const quantity = form.watch("quantity");
  const pricePerUnit = form.watch("pricePerUnit");
  const calculatedTotal = mode === "item_valuations" && quantity && pricePerUnit 
    ? (Number(quantity) * Number(pricePerUnit)).toFixed(2) 
    : null;

  const onSubmit = (data: AssetFormData) => {
    // For item_valuations, calculate investedAmount from quantity * pricePerUnit
    let finalInvestedAmount = data.investedAmount || "0";
    if (mode === "item_valuations" && data.quantity && data.pricePerUnit) {
      finalInvestedAmount = (Number(data.quantity) * Number(data.pricePerUnit)).toString();
    }

    const payload = {
      name: data.name || "",
      platformId,
      investedAmount: finalInvestedAmount,
      bonusAmount: data.bonusAmount || null,
      annualYield: data.annualYield || null,
      quantity: mode === "item_valuations" ? (data.quantity || null) : null,
      pricePerUnit: mode === "item_valuations" ? (data.pricePerUnit || null) : null,
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

  const defaultTrigger = isEdit ? (
    <Button size="sm" variant="ghost" data-testid={`button-edit-asset-${editAsset?.id}`}>
      <Pencil className="h-4 w-4" />
    </Button>
  ) : (
    <Button className="gap-2" data-testid="button-add-asset">
      <Plus className="h-4 w-4" /> Add {mode === "asset_returns" ? "Asset" : "Item"}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== undefined ? (
        trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>{defaultTrigger}</DialogTrigger>
      )}
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

          {mode === "item_valuations" ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Amount/Quantity</Label>
                  <Input 
                    id="quantity" 
                    type="number" 
                    step="0.0001"
                    {...form.register("quantity")} 
                    placeholder="e.g. 10" 
                    data-testid="input-asset-quantity"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pricePerUnit">Price per Unit</Label>
                  <Input 
                    id="pricePerUnit" 
                    type="number" 
                    step="0.01"
                    {...form.register("pricePerUnit")} 
                    placeholder="0.00" 
                    data-testid="input-asset-price-per-unit"
                  />
                </div>
              </div>
              {calculatedTotal && (
                <div className="text-sm text-muted-foreground">
                  Total Investment: <strong>${calculatedTotal}</strong>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="investedAmount">Your Investment</Label>
              <Input 
                id="investedAmount" 
                type="number" 
                step="0.01"
                {...form.register("investedAmount")} 
                placeholder="0.00" 
                data-testid="input-asset-invested"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="bonusAmount">Bonus (Optional)</Label>
            <Input 
              id="bonusAmount" 
              type="number" 
              step="0.01"
              {...form.register("bonusAmount")} 
              placeholder="Free money on top of investment" 
              data-testid="input-asset-bonus"
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

          <div className="pt-4 flex justify-between">
            {isEdit ? (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-asset"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit-asset">
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
