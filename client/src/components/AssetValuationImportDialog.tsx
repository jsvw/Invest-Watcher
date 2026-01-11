import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface ImportResult {
  message: string;
  success: number;
  failed: number;
  errors: { row: number; assetName: string; error: string }[];
}

interface AssetValuationImportDialogProps {
  platformId: number;
  trigger?: React.ReactNode;
}

export function AssetValuationImportDialog({ platformId, trigger }: AssetValuationImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`/api/platforms/${platformId}/asset-valuations/import`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Import failed');
      }
      
      return response.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: [`/api/platforms/${platformId}/assets`] });
      queryClient.invalidateQueries({ queryKey: [`/api/platforms/${platformId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'asset-performance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/history'] });
      
      if (data.success > 0) {
        toast({
          title: "Import Complete",
          description: `${data.success} valuations imported successfully${data.failed > 0 ? `, ${data.failed} failed` : ''}`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleImport = () => {
    if (selectedFile) {
      importMutation.mutate(selectedFile);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2" data-testid="button-import-valuations">
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import Asset Valuations</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Upload a CSV file to bulk update asset valuations. The CSV should have columns for:
          </div>
          
          <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
            <div className="font-medium">Required columns:</div>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              <li><code className="text-xs bg-muted px-1 rounded">asset</code> or <code className="text-xs bg-muted px-1 rounded">name</code> - Asset name (must match exactly)</li>
              <li><code className="text-xs bg-muted px-1 rounded">value</code> or <code className="text-xs bg-muted px-1 rounded">price</code> - Current value</li>
            </ul>
            <div className="font-medium mt-2">Optional columns:</div>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              <li><code className="text-xs bg-muted px-1 rounded">date</code> - Valuation date (defaults to today)</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csvFile">Select CSV File</Label>
            <Input
              id="csvFile"
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              data-testid="input-csv-file"
            />
            {selectedFile && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                {selectedFile.name}
              </div>
            )}
          </div>

          {result && (
            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2">
                {result.failed === 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : result.success === 0 ? (
                  <XCircle className="h-5 w-5 text-red-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
                <span className="font-medium">{result.message}</span>
              </div>
              
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Errors:</div>
                  <div className="max-h-32 overflow-y-auto text-sm space-y-1">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <div key={i} className="text-red-600 dark:text-red-400">
                        Row {err.row}: {err.assetName} - {err.error}
                      </div>
                    ))}
                    {result.errors.length > 10 && (
                      <div className="text-muted-foreground">
                        ... and {result.errors.length - 10} more errors
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              {result ? 'Close' : 'Cancel'}
            </Button>
            {!result && (
              <Button 
                onClick={handleImport}
                disabled={!selectedFile || importMutation.isPending}
                data-testid="button-submit-import"
              >
                {importMutation.isPending ? "Importing..." : "Import"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
