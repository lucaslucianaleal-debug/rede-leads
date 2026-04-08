import { useState, useMemo } from "react";
import { Lead } from "@/types/crm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DollarSign, TrendingUp, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface ROIRecord {
  id: string;
  date: string; // "YYYY-MM-DD"
  periodType: "mes" | "semana" | "custom";
  periodLabel: string;
  investmentAmount: number;
  createdAt: string;
}

interface ServiceROI {
  service: string;
  leadsCreated: number;
  appointments: number;
  presence: number;
  appointmentRate: number; // %
  presenceRate: number; // % of appointments
  allocatedBudget: number;
  costPerEffectiveLead: number;
}

const getStorageKey = (clinicId?: string) => `rede_roi_history_${clinicId || "default"}`;

export function ROIAnalysisView({ leads, clinicId }: { leads: Lead[]; clinicId?: string }) {
  const [periodType, setPeriodType] = useState<"mes" | "semana" | "custom">("mes");
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [selectedWeek, setSelectedWeek] = useState<string>(format(new Date(), "yyyy-ww"));
  const [customStart, setCustomStart] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState<string>(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [investmentAmount, setInvestmentAmount] = useState<string>("");
  const [showInvestmentDialog, setShowInvestmentDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedROI, setSelectedROI] = useState<ROIRecord | null>(null);

  // Load ROI history from localStorage
  const roiHistory = useMemo<ROIRecord[]>(() => {
    const storageKey = getStorageKey(clinicId);
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  }, [clinicId]);

  // Determine period date range
  const getPeriodRange = () => {
    const today = new Date();
    if (periodType === "mes") {
      return {
        start: startOfMonth(new Date(selectedMonth + "-01")),
        end: endOfMonth(new Date(selectedMonth + "-01")),
        label: format(new Date(selectedMonth + "-01"), "MMMM yyyy", { locale: ptBR }),
      };
    } else if (periodType === "semana") {
      const [year, week] = selectedWeek.split("-ww");
      const jan4 = new Date(parseInt(year), 0, 4);
      const weekStart = new Date(jan4);
      weekStart.setDate(jan4.getDate() - jan4.getDay() + 1 + (parseInt(week) - 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return {
        start: weekStart,
        end: weekEnd,
        label: `Semana ${week}/${year}`,
      };
    } else {
      return {
        start: new Date(customStart),
        end: new Date(customEnd),
        label: `${customStart} a ${customEnd}`,
      };
    }
  };

  const { start: periodStart, end: periodEnd, label: periodLabel } = getPeriodRange();

  // Filter leads by period
  const leadsInPeriod = useMemo(() => {
    return leads.filter((lead) => {
      if (!lead.dataCriacao) return false;
      const [day, month, year] = lead.dataCriacao.split("/");
      const leadDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return leadDate >= periodStart && leadDate <= periodEnd;
    });
  }, [leads, periodStart, periodEnd]);

  // Find investment record for this period
  const investmentRecord = useMemo(() => {
    return roiHistory.find((r) => r.periodLabel === periodLabel);
  }, [roiHistory, periodLabel]);

  // Calculate ROI data
  const roiData = useMemo(() => {
    const totalLeads = leadsInPeriod.length;
    const totalAppointments = leadsInPeriod.filter((l) => l.dataAgendamento).length;
    const totalPresence = leadsInPeriod.filter((l) => l.comparecimento === "COMPARECEU").length;

    // Group by service
    const serviceMap = new Map<string, Lead[]>();
    leadsInPeriod.forEach((lead) => {
      const service = lead.servicoProcurado || "Sem serviço";
      if (!serviceMap.has(service)) {
        serviceMap.set(service, []);
      }
      serviceMap.get(service)!.push(lead);
    });

    // Calculate ROI per service
    const investmentAmount = investmentRecord?.investmentAmount || 0;
    const serviceROIs: ServiceROI[] = [];

    serviceMap.forEach((serviceLeads, service) => {
      const leadsCount = serviceLeads.length;
      const appointmentsCount = serviceLeads.filter((l) => l.dataAgendamento).length;
      const presenceCount = serviceLeads.filter((l) => l.comparecimento === "COMPARECEU").length;

      // Allocate budget proportionally
      const allocatedBudget = (leadsCount / totalLeads) * investmentAmount;
      const costPerEffectiveLead = presenceCount > 0 ? allocatedBudget / presenceCount : 0;

      serviceROIs.push({
        service,
        leadsCreated: leadsCount,
        appointments: appointmentsCount,
        presence: presenceCount,
        appointmentRate: totalLeads > 0 ? (appointmentsCount / leadsCount) * 100 : 0,
        presenceRate: appointmentsCount > 0 ? (presenceCount / appointmentsCount) * 100 : 0,
        allocatedBudget,
        costPerEffectiveLead,
      });
    });

    // Sort by cost/lead (ascending = best)
    serviceROIs.sort((a, b) => a.costPerEffectiveLead - b.costPerEffectiveLead);

    const overallCostPerLead = totalPresence > 0 ? investmentAmount / totalPresence : 0;

    return {
      totalLeads,
      totalAppointments,
      totalPresence,
      appointmentRate: totalLeads > 0 ? (totalAppointments / totalLeads) * 100 : 0,
      presenceRate: totalAppointments > 0 ? (totalPresence / totalAppointments) * 100 : 0,
      overallCostPerLead,
      investmentAmount,
      services: serviceROIs,
      top3: serviceROIs.slice(0, 3),
    };
  }, [leadsInPeriod, investmentRecord]);

  // Handle save investment
  const handleSaveInvestment = () => {
    const amount = parseFloat(investmentAmount);
    if (isNaN(amount) || amount < 0) {
      toast.error("Valor inválido");
      return;
    }

    const storageKey = getStorageKey(clinicId);
    const newRecord: ROIRecord = {
      id: `${periodLabel}-${Date.now()}`,
      date: format(new Date(), "yyyy-MM-dd"),
      periodType,
      periodLabel,
      investmentAmount: amount,
      createdAt: new Date().toISOString(),
    };

    // Remove old record for this period if exists
    const updated = roiHistory.filter((r) => r.periodLabel !== periodLabel);
    updated.push(newRecord);

    localStorage.setItem(storageKey, JSON.stringify(updated));
    toast.success(`Investimento de R$ ${amount.toFixed(2)} registrado para ${periodLabel}`);
    setInvestmentAmount("");
    setShowInvestmentDialog(false);
  };

  // Handle delete investment
  const handleDeleteInvestment = () => {
    if (!selectedROI) return;
    const storageKey = getStorageKey(clinicId);
    const updated = roiHistory.filter((r) => r.id !== selectedROI.id);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    toast.success("Investimento removido");
    setShowDeleteDialog(false);
    setSelectedROI(null);
  };

  const getStatusBadge = () => {
    if (roiData.overallCostPerLead <= 80) return <Badge className="bg-green-500">✅ DENTRO</Badge>;
    if (roiData.overallCostPerLead <= 100) return <Badge className="bg-yellow-500">⚠️ ACIMA</Badge>;
    return <Badge className="bg-red-500">❌ CRÍTICO</Badge>;
  };

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    leads.forEach((lead) => {
      if (lead.dataCriacao) {
        const [, m, y] = lead.dataCriacao.split("/");
        months.add(`${y}-${m}`);
      }
    });
    return Array.from(months).sort().reverse();
  }, [leads]);

  return (
    <div className="space-y-6">
      {/* Period Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Análise ROI & Custos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Period Type Selection */}
          <div className="flex gap-2">
            <Button
              variant={periodType === "mes" ? "default" : "outline"}
              onClick={() => setPeriodType("mes")}
              size="sm"
            >
              Mês
            </Button>
            <Button
              variant={periodType === "semana" ? "default" : "outline"}
              onClick={() => setPeriodType("semana")}
              size="sm"
            >
              Semana
            </Button>
            <Button
              variant={periodType === "custom" ? "default" : "outline"}
              onClick={() => setPeriodType("custom")}
              size="sm"
            >
              Período
            </Button>
          </div>

          {/* Period Input */}
          <div className="flex gap-2">
            {periodType === "mes" && (
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-40"
              />
            )}
            {periodType === "semana" && (
              <Input
                type="week"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="w-40"
              />
            )}
            {periodType === "custom" && (
              <>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-40"
                />
                <span className="self-center text-muted-foreground">até</span>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-40"
                />
              </>
            )}
          </div>

          {/* Investment Input */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Investimento do Período
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                  className="flex-1"
                  min="0"
                  step="0.01"
                />
                <Button onClick={() => setShowInvestmentDialog(true)} size="sm">
                  Registrar
                </Button>
              </div>
            </div>
          </div>

          {/* Current Investment Display */}
          {investmentRecord && (
            <div className="p-2 bg-blue-50 rounded border border-blue-200 text-sm">
              <div className="flex justify-between items-center">
                <span>
                  💰 <strong>R$ {investmentRecord.investmentAmount.toFixed(2)}</strong> registrado em{" "}
                  {format(new Date(investmentRecord.createdAt), "dd/MM/yyyy")}
                </span>
                <button
                  onClick={() => {
                    setSelectedROI(investmentRecord);
                    setShowDeleteDialog(true);
                  }}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {roiData.investmentAmount > 0 && (
        <div className="grid md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{roiData.totalLeads}</div>
              <p className="text-xs text-muted-foreground">Leads Criados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {roiData.totalAppointments} <span className="text-sm">({roiData.appointmentRate.toFixed(1)}%)</span>
              </div>
              <p className="text-xs text-muted-foreground">Agendamentos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {roiData.totalPresence} <span className="text-sm">({roiData.presenceRate.toFixed(1)}%)</span>
              </div>
              <p className="text-xs text-muted-foreground">Presença</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                R$ {roiData.overallCostPerLead.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">Custo/Lead Efetivo</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{getStatusBadge()}</div>
              <p className="text-xs text-muted-foreground">Status (Meta: R$ 80)</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top 3 Services */}
      {roiData.top3.length > 0 && roiData.investmentAmount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              🏆 Top 3 Melhores Serviços
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {roiData.top3.map((service, idx) => (
              <div
                key={service.service}
                className="p-4 border rounded-lg bg-gradient-to-r from-green-50 to-transparent"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold text-green-600">#{idx + 1}</div>
                    <div>
                      <h3 className="font-semibold">{service.service}</h3>
                      <p className="text-xs text-muted-foreground">
                        Custo/Lead: <strong>R$ {service.costPerEffectiveLead.toFixed(2)}</strong>
                      </p>
                    </div>
                  </div>
                  {service.costPerEffectiveLead <= 80 && <Badge className="bg-green-500">✅ IDEAL</Badge>}
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Leads</p>
                    <p className="font-semibold">{service.leadsCreated}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Agendamentos</p>
                    <p className="font-semibold">
                      {service.appointments} <span className="text-xs">({service.appointmentRate.toFixed(0)}%)</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Presença</p>
                    <p className="font-semibold">
                      {service.presence} <span className="text-xs">({service.presenceRate.toFixed(0)}%)</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Orçamento</p>
                    <p className="font-semibold">R$ {service.allocatedBudget.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All Services Table */}
      {roiData.services.length > 0 && roiData.investmentAmount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>📊 Todos os Serviços</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Serviço</th>
                    <th className="text-center py-2 px-2">Leads</th>
                    <th className="text-center py-2 px-2">Agendamentos</th>
                    <th className="text-center py-2 px-2">Presença</th>
                    <th className="text-center py-2 px-2">Orçamento</th>
                    <th className="text-center py-2 px-2">Custo/Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {roiData.services.map((service) => (
                    <tr key={service.service} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-2">{service.service}</td>
                      <td className="text-center py-2 px-2">{service.leadsCreated}</td>
                      <td className="text-center py-2 px-2">
                        {service.appointments} ({service.appointmentRate.toFixed(0)}%)
                      </td>
                      <td className="text-center py-2 px-2">
                        {service.presence} ({service.presenceRate.toFixed(0)}%)
                      </td>
                      <td className="text-center py-2 px-2">R$ {service.allocatedBudget.toFixed(2)}</td>
                      <td
                        className={`text-center py-2 px-2 font-semibold ${
                          service.costPerEffectiveLead <= 80 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        R$ {service.costPerEffectiveLead.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog para salvar investimento */}
      <Dialog open={showInvestmentDialog} onOpenChange={setShowInvestmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Investimento</DialogTitle>
            <DialogDescription>
              Período: <strong>{periodLabel}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Valor do Investimento (R$)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={investmentAmount}
                onChange={(e) => setInvestmentAmount(e.target.value)}
                autoFocus
                min="0"
                step="0.01"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvestmentDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveInvestment}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Investimento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o registro de investimento de R${" "}
              {selectedROI?.investmentAmount.toFixed(2)} para {selectedROI?.periodLabel}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInvestment} className="bg-red-600">
              Remover
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
