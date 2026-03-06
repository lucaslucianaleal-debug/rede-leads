import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle, RefreshCw, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

interface NextSend {
  leadId: string;
  leadName: string;
  telefone: string;
  servicoProcurado: string;
  slot: string;
  scheduledFor: string;
  appointmentDate: string;
}

export function NextSendsPanel() {
  const [nextSends, setNextSends] = useState<NextSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadNextSends = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch from backend API
      const response = await fetch('http://localhost:3001/api/next-sends', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        if (response.status === 404) {
          setNextSends([]);
          setError("Aguardando primeiro ciclo do worker...");
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setNextSends(Array.isArray(data) ? data : []);
      setLastUpdate(new Date());
    } catch (e) {
      console.warn('[NextSendsPanel] Aviso:', (e as Error).message);
      setError("Não foi possível carregar próximos disparos");
      setNextSends([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNextSends();
    
    // Recarregar a cada 2 minutos
    const interval = setInterval(loadNextSends, 2 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const getSlotColor = (slot: string) => {
    switch (slot) {
      case "24h":
        return "bg-green-100 text-green-800";
      case "12h":
        return "bg-yellow-100 text-yellow-800";
      case "3h":
        return "bg-orange-100 text-orange-800";
      case "1h":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getSlotLabel = (slot: string) => {
    switch (slot) {
      case "24h":
        return "Amanhã";
      case "12h":
        return "12h antes";
      case "3h":
        return "3h antes";
      case "1h":
        return "1h antes";
      default:
        return slot;
    }
  };

  const formatScheduledTime = (isoTime: string): string => {
    try {
      const date = new Date(isoTime);
      return format(date, "dd/MM HH:mm");
    } catch {
      return isoTime;
    }
  };

  const formatTimeUntil = (isoTime: string): string => {
    try {
      const scheduled = new Date(isoTime);
      const now = new Date();
      const diff = scheduled.getTime() - now.getTime();

      if (diff < 0) return "Vencido";

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `em ${days}d ${hours % 24}h`;
      }
      if (hours > 0) return `em ${hours}h${minutes}m`;
      if (minutes > 0) return `em ${minutes}m`;
      return "agora";
    } catch {
      return "?";
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            <CardTitle>Próximos Disparos</CardTitle>
            <Badge variant="outline" className="text-xs">
              {nextSends.length} agendados
            </Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={loadNextSends}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {lastUpdate && (
          <p className="text-xs text-muted-foreground mt-1">
            Atualizado há {Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s
          </p>
        )}
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded flex items-start gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <span className="text-amber-700">{error}</span>
          </div>
        )}

        {nextSends.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <CheckCircle className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
            <p>Nenhum lembrete agendado para os próximos dias</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {nextSends
              .sort(
                (a, b) =>
                  new Date(a.scheduledFor).getTime() -
                  new Date(b.scheduledFor).getTime()
              )
              .map((send, idx) => (
                <div
                  key={`${send.leadId}-${send.slot}-${idx}`}
                  className="p-3 rounded-lg bg-background/60 border border-muted hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{send.leadName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {send.servicoProcurado}
                      </p>
                    </div>
                    <Badge className={getSlotColor(send.slot)}>
                      {getSlotLabel(send.slot)}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-xs mt-2">
                    <Clock className="h-3 w-3 text-blue-500 flex-shrink-0" />
                    <span className="text-muted-foreground">
                      {formatScheduledTime(send.scheduledFor)}
                    </span>
                    <span className="text-blue-600 font-medium ml-auto">
                      {formatTimeUntil(send.scheduledFor)}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mt-1">
                    Agendamento: {send.appointmentDate}
                  </p>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
