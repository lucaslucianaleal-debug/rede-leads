import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Smartphone } from "lucide-react";

interface WhatsAppQRModalProps {
  qrCode: string | null;
  onClose: () => void;
}

export function WhatsAppQRModal({ qrCode, onClose }: WhatsAppQRModalProps) {
  // Fecha automaticamente quando o QR some (autenticado)
  useEffect(() => {
    if (qrCode === null) {
      onClose();
    }
  }, [qrCode, onClose]);

  return (
    <Dialog open={qrCode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-green-600" />
            Conectar WhatsApp
          </DialogTitle>
          <DialogDescription>
            Escaneie o QR Code com o WhatsApp para conectar o servidor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {qrCode ? (
            <img
              src={qrCode}
              alt="QR Code WhatsApp"
              className="w-64 h-64 rounded-lg border border-gray-200 shadow-sm"
            />
          ) : (
            <div className="w-64 h-64 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-400 text-sm">
              Gerando QR Code...
            </div>
          )}

          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
            <li>Toque em <strong>Aparelhos conectados</strong></li>
            <li>Toque em <strong>Conectar aparelho</strong></li>
            <li>Aponte a câmera para o QR Code acima</li>
          </ol>

          <p className="text-xs text-muted-foreground">
            O código expira em ~20 segundos. Um novo será gerado automaticamente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
