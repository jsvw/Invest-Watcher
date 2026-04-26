import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";
import { format } from "date-fns";
import type { ConfirmDepositItem } from "@/hooks/use-investments";

interface ConfirmDepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ConfirmDepositItem | null;
  currency: string;
  isPending: boolean;
  onConfirm: (newValuation: number | undefined) => void;
}

export function ConfirmDepositDialog({
  open,
  onOpenChange,
  item,
  currency,
  isPending,
  onConfirm,
}: ConfirmDepositDialogProps) {
  const isStandard = item?.platformMode === "standard";
  const suggestedValue = item ? item.currentValue + item.totalAmount : 0;

  const form = useForm<{ newValuation: string }>({
    defaultValues: { newValuation: suggestedValue.toFixed(2) },
  });

  useEffect(() => {
    if (open && item) {
      form.reset({ newValuation: (item.currentValue + item.totalAmount).toFixed(2) });
    }
  }, [open, item, form]);

  const onSubmit = (data: { newValuation: string }) => {
    if (isStandard) {
      const parsed = parseFloat(data.newValuation);
      if (isNaN(parsed) || parsed < 0) return;
      onConfirm(parsed);
    } else {
      onConfirm(undefined);
    }
  };

  if (!item) return null;

  const isBatch = item.investmentIds.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Confirm deposit</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.platformColor }} />
            <span className="font-medium text-foreground">{item.platformName}</span>
          </div>
          {isBatch ? (
            <p>
              {item.investmentIds.length} pending deposits totalling{" "}
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {formatCurrency(item.totalAmount, currency)}
              </span>
            </p>
          ) : (
            <p>
              Deposit of{" "}
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {formatCurrency(item.totalAmount, currency)}
              </span>
              {item.depositDate && (
                <> on {format(new Date(item.depositDate), "MMM dd, yyyy")}</>
              )}
            </p>
          )}
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {isStandard ? (
            <div className="space-y-2">
              <Label htmlFor="newValuation">New platform balance after deposit</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {getCurrencySymbol(currency)}
                </span>
                <Input
                  id="newValuation"
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-8"
                  {...form.register("newValuation", { required: true })}
                  data-testid="input-new-valuation"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Suggested: {formatCurrency(item.currentValue, currency)} (current) +{" "}
                {formatCurrency(item.totalAmount, currency)} (deposit) ={" "}
                <span className="font-medium">{formatCurrency(suggestedValue, currency)}</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              This platform's balance is calculated from individual assets — no separate valuation entry is needed.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              data-testid="button-cancel-confirm-deposit"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-submit-confirm-deposit"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              {isPending ? "Confirming…" : "Confirm"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
