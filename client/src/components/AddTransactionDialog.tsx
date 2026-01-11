import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertInvestmentSchema, insertValuationSchema, insertWithdrawalSchema } from "@shared/schema";
import { useCreateInvestment, useUpdateInvestment } from "@/hooks/use-investments";
import { useCreateValuation, useUpdateValuation } from "@/hooks/use-valuations";
import { useCreateWithdrawal, useUpdateWithdrawal } from "@/hooks/use-withdrawals";
import { useState, useEffect } from "react";
import { PlusCircle, RefreshCw, Pencil, ArrowDownCircle } from "lucide-react";
import { z } from "zod";

// Schemas with coercion for strings -> numbers
const investmentFormSchema = insertInvestmentSchema.extend({
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  date: z.coerce.date().transform(d => d.toISOString().split('T')[0]),
});

const withdrawalFormSchema = insertWithdrawalSchema.extend({
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  date: z.coerce.date().transform(d => d.toISOString().split('T')[0]),
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
}

export function AddTransactionDialog({ platformId, type, initialData, mode = "add" }: Props) {
  const [open, setOpen] = useState(false);
  const isInvestment = type === "investment";
  const isEdit = mode === "edit";
  
  const createInvestment = useCreateInvestment();
  const updateInvestment = useUpdateInvestment();
  const createValuation = useCreateValuation();
  const updateValuation = useUpdateValuation();
  
  const isPending = isInvestment 
    ? (isEdit ? updateInvestment.isPending : createInvestment.isPending)
    : (isEdit ? updateValuation.isPending : createValuation.isPending);

  const form = useForm({
    resolver: zodResolver(isInvestment ? investmentFormSchema : valuationFormSchema),
    defaultValues: initialData || {
      platformId,
      amount: 0,
      value: 0,
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      notes: "",
    },
  });

  useEffect(() => {
    if (open && initialData) {
      form.reset(initialData);
    }
  }, [open, initialData, form]);

  const onSubmit = (data: any) => {
    const payload = { ...data, platformId };
    
    if (isInvestment) {
      const mutation = isEdit ? updateInvestment : createInvestment;
      mutation.mutate(isEdit ? { id: initialData.id, ...payload } : payload, {
        onSuccess: () => {
          setOpen(false);
          if (!isEdit) form.reset({ ...data, amount: 0, notes: "" });
        }
      });
    } else {
      const mutation = isEdit ? updateValuation : createValuation;
      mutation.mutate(isEdit ? { id: initialData.id, ...payload } : payload, {
        onSuccess: () => {
          setOpen(false);
          if (!isEdit) form.reset({ ...data, value: 0 });
        }
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant={isInvestment ? "default" : "outline"} className="gap-2">
            {isInvestment ? <PlusCircle className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            {isInvestment ? "Add Investment" : "Update Valuation"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit" : (isInvestment ? "Record New" : "Update Current")} {isInvestment ? "Investment" : "Valuation"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          
          <div className="space-y-2">
            <Label htmlFor="amount">{isInvestment ? "Amount Invested ($)" : "Current Total Value ($)"}</Label>
            <Input 
              id={isInvestment ? "amount" : "value"} 
              type="number" 
              step="0.01"
              {...form.register(isInvestment ? "amount" : "value")} 
            />
            {form.formState.errors[isInvestment ? "amount" : "value"] && (
              <p className="text-sm text-destructive">
                {String(form.formState.errors[isInvestment ? "amount" : "value"]?.message)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...form.register("date")} />
          </div>

          {isInvestment && (
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input id="notes" {...form.register("notes")} placeholder="e.g. Monthly contribution" />
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : (isEdit ? "Update Record" : "Save Transaction")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
