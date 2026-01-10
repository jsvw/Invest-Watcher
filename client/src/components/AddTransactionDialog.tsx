import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertInvestmentSchema, insertValuationSchema } from "@shared/schema";
import { useCreateInvestment } from "@/hooks/use-investments";
import { useCreateValuation } from "@/hooks/use-valuations";
import { useState } from "react";
import { PlusCircle, RefreshCw } from "lucide-react";
import { z } from "zod";

// Schemas with coercion for strings -> numbers
const investmentFormSchema = insertInvestmentSchema.extend({
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  date: z.coerce.date(),
});

const valuationFormSchema = insertValuationSchema.extend({
  value: z.coerce.number().min(0, "Value cannot be negative"),
  date: z.coerce.date(),
});

interface Props {
  platformId: number;
  type: "investment" | "valuation";
}

export function AddTransactionDialog({ platformId, type }: Props) {
  const [open, setOpen] = useState(false);
  const isInvestment = type === "investment";
  
  const createInvestment = useCreateInvestment();
  const createValuation = useCreateValuation();
  
  const isPending = isInvestment ? createInvestment.isPending : createValuation.isPending;

  const form = useForm({
    resolver: zodResolver(isInvestment ? investmentFormSchema : valuationFormSchema),
    defaultValues: {
      platformId,
      amount: 0,
      value: 0,
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      notes: "",
    },
  });

  const onSubmit = (data: any) => {
    // Explicitly ensure platformId is set (form reset might clear it)
    const payload = { ...data, platformId };
    
    if (isInvestment) {
      createInvestment.mutate(payload, {
        onSuccess: () => {
          setOpen(false);
          form.reset({ ...data, amount: 0, notes: "" });
        }
      });
    } else {
      createValuation.mutate(payload, {
        onSuccess: () => {
          setOpen(false);
          form.reset({ ...data, value: 0 });
        }
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isInvestment ? "default" : "outline"} className="gap-2">
          {isInvestment ? <PlusCircle className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          {isInvestment ? "Add Investment" : "Update Valuation"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isInvestment ? "Record New Investment" : "Update Current Valuation"}</DialogTitle>
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
              {isPending ? "Saving..." : "Save Transaction"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
