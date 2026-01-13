import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Banknote, Trash2, Pencil, X } from "lucide-react";
import type { Asset, AssetRepayment } from "@shared/schema";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface RepaymentFormData {
  amount: string;
  date: string;
  notes: string;
}

interface AssetRepaymentDialogProps {
  asset: Asset;
  platformId: number;
  currency: string;
}

export function AssetRepaymentDialog({ asset, platformId, currency }: AssetRepaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: repayments, isLoading } = useQuery<AssetRepayment[]>({
    queryKey: ['/api/assets', asset.id, 'repayments'],
    queryFn: async () => {
      const res = await fetch(`/api/assets/${asset.id}/repayments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch repayments");
      return res.json();
    },
    enabled: open
  });

  const createMutation = useMutation({
    mutationFn: async (data: { assetId: number; amount: string; date: Date; notes: string | null }) => {
      return apiRequest('POST', '/api/asset-repayments', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', asset.id, 'repayments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'assets'] });
      toast({ title: "Repayment recorded", description: "The partial repayment has been added." });
      form.reset({ amount: "", date: new Date().toISOString().split('T')[0], notes: "" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to record repayment.", variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; amount: string; date: Date; notes: string | null }) => {
      return apiRequest('PATCH', `/api/asset-repayments/${data.id}`, {
        amount: data.amount,
        date: data.date,
        notes: data.notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', asset.id, 'repayments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'assets'] });
      toast({ title: "Repayment updated", description: "The repayment has been updated." });
      setEditingId(null);
      form.reset({ amount: "", date: new Date().toISOString().split('T')[0], notes: "" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update repayment.", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/asset-repayments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', asset.id, 'repayments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'assets'] });
      toast({ title: "Repayment deleted", description: "The repayment has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete repayment.", variant: "destructive" });
    }
  });

  const form = useForm<RepaymentFormData>({
    defaultValues: {
      amount: "",
      date: new Date().toISOString().split('T')[0],
      notes: ""
    }
  });

  const onSubmit = (data: RepaymentFormData) => {
    if (!data.amount || Number(data.amount) <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid repayment amount.", variant: "destructive" });
      return;
    }

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        amount: data.amount,
        date: new Date(data.date),
        notes: data.notes || null
      });
    } else {
      createMutation.mutate({
        assetId: asset.id,
        amount: data.amount,
        date: new Date(data.date),
        notes: data.notes || null
      });
    }
  };

  const startEditing = (repayment: AssetRepayment) => {
    setEditingId(repayment.id);
    form.reset({
      amount: String(repayment.amount),
      date: new Date(repayment.date).toISOString().split('T')[0],
      notes: repayment.notes || ""
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    form.reset({ amount: "", date: new Date().toISOString().split('T')[0], notes: "" });
  };

  const totalRepaid = repayments?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
  const investedAmount = Number(asset.investedAmount);
  const remainingPrincipal = investedAmount - totalRepaid;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="sm" 
          variant="outline" 
          className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50" 
          data-testid={`button-repayment-asset-${asset.id}`}
        >
          <Banknote className="h-3 w-3" /> Repayment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Partial Repayments</DialogTitle>
          <DialogDescription>
            Track principal repayments for {asset.name}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 p-3 bg-muted rounded-lg text-sm">
            <div>
              <div className="text-muted-foreground">Invested</div>
              <div className="font-medium">{formatCurrency(investedAmount, currency)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Repaid</div>
              <div className="font-medium text-green-600">{formatCurrency(totalRepaid, currency)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Remaining</div>
              <div className="font-medium">{formatCurrency(remainingPrincipal, currency)}</div>
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...form.register("amount")}
                  data-testid="input-repayment-amount"
                />
              </div>
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  {...form.register("date")}
                  data-testid="input-repayment-date"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="e.g., Monthly principal repayment"
                {...form.register("notes")}
                data-testid="input-repayment-notes"
              />
            </div>
            <div className="flex gap-2">
              {editingId && (
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={cancelEditing}
                  data-testid="button-cancel-edit"
                >
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
              )}
              <Button 
                type="submit" 
                className="flex-1" 
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid={editingId ? "button-update-repayment" : "button-add-repayment"}
              >
                {editingId 
                  ? (updateMutation.isPending ? "Updating..." : "Update Repayment")
                  : (createMutation.isPending ? "Adding..." : "Add Repayment")
                }
              </Button>
            </div>
          </form>

          {repayments && repayments.length > 0 && (
            <div className="space-y-2">
              <Label>Repayment History</Label>
              <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                {repayments.map((repayment) => (
                  <div 
                    key={repayment.id} 
                    className="flex items-center justify-between p-2 text-sm"
                    data-testid={`row-repayment-${repayment.id}`}
                  >
                    <div>
                      <span className="font-medium text-green-600">
                        {formatCurrency(Number(repayment.amount), currency)}
                      </span>
                      <span className="text-muted-foreground ml-2">
                        {format(new Date(repayment.date), 'MMM dd, yyyy')}
                      </span>
                      {repayment.notes && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          ({repayment.notes})
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => startEditing(repayment)}
                        disabled={editingId === repayment.id}
                        data-testid={`button-edit-repayment-${repayment.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:bg-destructive/10"
                        onClick={() => deleteMutation.mutate(repayment.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-repayment-${repayment.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="text-center text-sm text-muted-foreground">Loading history...</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
