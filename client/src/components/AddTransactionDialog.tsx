import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertInvestmentSchema, insertValuationSchema, insertWithdrawalSchema } from "@shared/schema";
import { useCreateInvestment, useUpdateInvestment } from "@/hooks/use-investments";
import { useCreateValuation, useUpdateValuation } from "@/hooks/use-valuations";
import { useCreateWithdrawal, useUpdateWithdrawal } from "@/hooks/use-withdrawals";
import { useState, useEffect } from "react";
import { PlusCircle, RefreshCw, Pencil, ArrowUpCircle } from "lucide-react";
import { z } from "zod";

const investmentFormSchema = insertInvestmentSchema.extend({
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  bonusAmount: z.coerce.number().min(0).optional(),
  date: z.coerce.date().transform(d => d.toISOString().split('T')[0]),
});

const withdrawalFormSchema = insertWithdrawalSchema.extend({
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  date: z.coerce.date().transform(d => d.toISOString().split('T')[0]),
  currentValue: z.coerce.number().min(0, "Current value cannot be negative").optional(),
});

const valuationFormSchema = insertValuationSchema.extend({
  value: z.coerce.number().min(0, "Value cannot be negative"),
  date: z.coerce.date().transform(d => d.toISOString().split('T')[0]),
});

interface Props {
  platformId: number;
  type: "investment" | "valuation" | "withdrawal";
  initialData?: any;
  mode?: "add" | "edit";
  showPendingCheckbox?: boolean;
}

export function AddTransactionDialog({ platformId, type, initialData, mode = "add", showPendingCheckbox = false }: Props) {
  const [open, setOpen] = useState(false);
  const isInvestment = type === "investment";
  const isWithdrawal = type === "withdrawal";
  const isValuation = type === "valuation";
  const isEdit = mode === "edit";
  
  const createInvestment = useCreateInvestment();
  const updateInvestment = useUpdateInvestment();
  const createValuation = useCreateValuation();
  const updateValuation = useUpdateValuation();
  const createWithdrawal = useCreateWithdrawal();
  const updateWithdrawal = useUpdateWithdrawal();
  
  const getPending = () => {
    if (isInvestment) return isEdit ? updateInvestment.isPending : createInvestment.isPending;
    if (isWithdrawal) return isEdit ? updateWithdrawal.isPending : createWithdrawal.isPending;
    return isEdit ? updateValuation.isPending : createValuation.isPending;
  };

  const getSchema = () => {
    if (isInvestment) return investmentFormSchema;
    if (isWithdrawal) return withdrawalFormSchema;
    return valuationFormSchema;
  };

  const form = useForm({
    resolver: zodResolver(getSchema()),
    defaultValues: initialData || {
      platformId,
      amount: 0,
      bonusAmount: 0,
      value: 0,
      currentValue: 0,
      date: new Date().toISOString().split('T')[0],
      notes: "",
    },
  });

  useEffect(() => {
    if (open && initialData) {
      form.reset(initialData);
    }
  }, [open, initialData, form]);

  const onSubmit = (data: any) => {
    const payload = { 
      ...data, 
      platformId,
      amount: data.amount !== undefined ? String(data.amount) : undefined,
      bonusAmount: data.bonusAmount ? String(data.bonusAmount) : null,
      value: data.value !== undefined ? String(data.value) : undefined,
      currentValue: data.currentValue !== undefined ? String(data.currentValue) : undefined,
    };
    const onSuccess = () => {
      setOpen(false);
      if (!isEdit) {
        form.reset({ ...data, amount: 0, bonusAmount: 0, value: 0, currentValue: 0, notes: "" });
      }
    };
    
    if (isInvestment) {
      if (isEdit) {
        updateInvestment.mutate({ id: initialData.id, ...payload }, { onSuccess });
      } else {
        createInvestment.mutate(payload, { onSuccess });
      }
    } else if (isWithdrawal) {
      if (isEdit) {
        updateWithdrawal.mutate({ id: initialData.id, ...payload }, { onSuccess });
      } else {
        createWithdrawal.mutate(payload, { onSuccess });
      }
    } else {
      if (isEdit) {
        updateValuation.mutate({ id: initialData.id, ...payload }, { onSuccess });
      } else {
        createValuation.mutate(payload, { onSuccess });
      }
    }
  };

  const getTitle = () => {
    const action = isEdit ? "Edit" : "Record";
    if (isInvestment) return `${action} Investment`;
    if (isWithdrawal) return `${action} Withdrawal`;
    return isEdit ? "Edit Valuation" : "Update Valuation";
  };

  const getButtonLabel = () => {
    if (isInvestment) return "Add Investment";
    if (isWithdrawal) return "Withdraw";
    return "Update Valuation";
  };

  const getIcon = () => {
    if (isInvestment) return <PlusCircle className="h-4 w-4" />;
    if (isWithdrawal) return <ArrowUpCircle className="h-4 w-4" />;
    return <RefreshCw className="h-4 w-4" />;
  };

  const getAmountLabel = () => {
    if (isInvestment) return "Amount Invested";
    if (isWithdrawal) return "Amount Withdrawn";
    return "Current Total Value";
  };

  const amountField = isValuation ? "value" : "amount";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-edit-${type}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button 
            variant={isInvestment ? "default" : isWithdrawal ? "secondary" : "outline"} 
            className="gap-2"
            data-testid={`button-add-${type}`}
          >
            {getIcon()}
            {getButtonLabel()}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor={amountField}>{getAmountLabel()}</Label>
            <Input 
              id={amountField}
              type="number" 
              step="0.01"
              {...form.register(amountField)} 
              data-testid={`input-${amountField}`}
            />
            {form.formState.errors[amountField] && (
              <p className="text-sm text-destructive">
                {String(form.formState.errors[amountField]?.message)}
              </p>
            )}
          </div>

          {isInvestment && (
            <div className="space-y-2">
              <Label htmlFor="bonusAmount">Bonus Amount (Optional)</Label>
              <Input 
                id="bonusAmount"
                type="number" 
                step="0.01"
                {...form.register("bonusAmount")} 
                placeholder="e.g. 50"
                data-testid="input-bonus-amount"
              />
            </div>
          )}

          {isInvestment && showPendingCheckbox && (
            <div className="flex items-center gap-3">
              <Controller
                control={form.control}
                name="isPending"
                render={({ field }) => (
                  <Checkbox
                    id="isPending"
                    checked={!!field.value}
                    onCheckedChange={field.onChange}
                    data-testid="checkbox-is-pending"
                  />
                )}
              />
              <Label htmlFor="isPending" className="cursor-pointer font-normal">
                Mark as pending (deposit not yet reflected in platform balance)
              </Label>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...form.register("date")} data-testid="input-date" />
          </div>

          {isWithdrawal && !isEdit && (
            <div className="space-y-2">
              <Label htmlFor="currentValue">Current Platform Value (after withdrawal)</Label>
              <Input 
                id="currentValue"
                type="number" 
                step="0.01"
                {...form.register("currentValue")} 
                data-testid="input-current-value"
              />
              {form.formState.errors.currentValue && (
                <p className="text-sm text-destructive">
                  {String(form.formState.errors.currentValue?.message)}
                </p>
              )}
            </div>
          )}

          {(isInvestment || isWithdrawal) && (
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input 
                id="notes" 
                {...form.register("notes")} 
                placeholder={isWithdrawal ? "e.g. Partial cashout" : "e.g. Monthly contribution"} 
                data-testid="input-notes"
              />
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={getPending()} data-testid="button-submit-transaction">
              {getPending() ? "Saving..." : (isEdit ? "Update" : "Save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
