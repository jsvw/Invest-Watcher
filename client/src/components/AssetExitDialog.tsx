import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { useExitAsset } from "@/hooks/use-assets";
import { useState } from "react";
import { LogOut, Pencil } from "lucide-react";
import type { Asset } from "@shared/schema";

interface AssetExitDialogProps {
  asset: Asset;
  platformId: number;
  mode?: "exit" | "edit";
}

export function AssetExitDialog({ asset, platformId, mode = "exit" }: AssetExitDialogProps) {
  const [open, setOpen] = useState(false);
  const exitMutation = useExitAsset(platformId);
  const isEdit = mode === "edit";

  const form = useForm({
    defaultValues: {
      exitDate: isEdit && asset.exitDate 
        ? new Date(asset.exitDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      exitPrice: isEdit && asset.exitPrice ? String(asset.exitPrice) : "",
    },
  });

  const onSubmit = (data: { exitDate: string; exitPrice: string }) => {
    exitMutation.mutate(
      { id: asset.id, exitDate: data.exitDate, exitPrice: data.exitPrice },
      {
        onSuccess: () => {
          setOpen(false);
          form.reset();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button size="sm" variant="outline" className="gap-1" data-testid={`button-edit-exit-${asset.id}`}>
            <Pencil className="h-3 w-3" /> Edit Exit
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50" data-testid={`button-exit-asset-${asset.id}`}>
            <LogOut className="h-3 w-3" /> Exit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Exit Details" : "Mark as Exited (Sold)"}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-4">
          {isEdit ? "Editing exit details for:" : "Recording the sale of:"} <strong>{asset.name}</strong>
        </div>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="exitDate">Exit Date</Label>
            <Input 
              id="exitDate" 
              type="date" 
              {...form.register("exitDate")} 
              data-testid="input-exit-date"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exitPrice">Sale Price</Label>
            <Input 
              id="exitPrice" 
              type="number" 
              step="0.01"
              {...form.register("exitPrice")} 
              placeholder="0.00" 
              data-testid="input-exit-price"
            />
            <p className="text-xs text-muted-foreground">
              Original investment: ${Number(asset.investedAmount).toLocaleString()}
            </p>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button 
              type="submit" 
              disabled={exitMutation.isPending} 
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-confirm-exit"
            >
              {exitMutation.isPending ? "Processing..." : "Confirm Exit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
