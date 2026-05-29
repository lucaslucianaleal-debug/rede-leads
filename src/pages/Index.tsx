import { useLeads } from "@/hooks/useLeads";
import { useAuth } from "@/hooks/useAuth";
import { ClinicChip } from "@/components/ClinicChip";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useConversations } from "@/hooks/useConversations";
import { Lead } from "@/types/crm";
import { CLINICAS } from "@/hooks/useCupons";
import { StatsCards } from "@/components/crm/StatsCards";
import { FollowUpQueue } from "@/components/crm/FollowUpQueue";
import { CallReturnQueue } from "@/components/crm/CallReturnQueue";
import { AuthComponent } from "@/components/crm/AuthComponent";
import { AdminPanel } from "@/components/crm/AdminPanel";
import { ReminderQueue } from "@/components/crm/ReminderQueue";
import { CalendarView } from "@/components/crm/CalendarView";
import { AllLeadsView } from "@/components/crm/AllLeadsView";
import { AgendaDoDia } from "@/components/crm/AgendaDoDia";
import { ChatView } from "@/components/crm/ChatView";
import { PerformanceChart } from "@/components/crm/PerformanceChart";
import { ComparisonChart } from "@/components/crm/ComparisonChart";
import { CallLogDialog } from "@/components/crm/CallLogDialog";
import { NewLeadsTab } from "@/components/crm/NewLeadsTab";
import { ROIAnalysisView } from "@/components/crm/ROIAnalysisView";
import { ServicosExternos } from "@/components/crm/ServicosExternos";
import { FollowUpRuler } from "@/components/crm/FollowUpRuler";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Activity, Calendar as CalendarIcon, LayoutDashboard, Database, Trash2, Copy, FileText, FileSpreadsheet, CalendarCheck, MoreVertical, MessageCircle, Plus, Inbox, DollarSign, Ticket, BookOpen } from "lucide-react";
import { CreateLeadDialog } from "@/components/crm/CreateLeadDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FunnelIcon } from "@/components/FunnelIcon";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRef, useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const CRMDashboard = () => {
  const { user, currentClinic, setSelectedClinic } = useAuth();
  const { permissions, isReceptionist, role } = useUserPermissions();
  const {
    leads,
    loading,
    stats,
    callReturnQueue,
    followUpQueue,
    followUpsDoneToday,
    followUpGoal,
    reminderQueue,
    sendFollowUp,
    markReminder,
    updateLead,
    createLead,
    clearCallReturn,
    registerCall,
    exportCSV,
    exportAppointments,
    exportDailyReport,
    exportWeeklyReport,
    exportRangeReport,
    exportWeeklyAppointments,
    exportWeeklyAppointmentsXlsx,
    exportFilteredAppointmentsXlsx,
    importCSV,
    deleteLeads,
    deleteLead,
    clearAllLeads,
    clearDuplicates,
    allLeads,
  } = useLeads();

  const { totalUnread, sendMessage, serverConnected } = useConversations();

  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClearDuplicatesDialog, setShowClearDuplicatesDialog] = useState(false);
  const [callLead, setCallLead] = useState<Lead | null>(null);
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState("dashboard");
  const [clientTab, setClientTab] = useState("agenda");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [clientClinicIds, setClientClinicIds] = useState<string[]>([]);

  // ...chat logic removido...

  // Detectar se é cliente e carregar clínicas permitidas
  useEffect(() => {
    if (role === "cliente") {
      setIsClient(true);
      // Carregar todas as clínicas que o cliente pode acessar
      const allowedClinicIds = CLINICAS.map((c) => c.id);
      setClientClinicIds(allowedClinicIds);
    } else {
      setIsClient(false);
      setClientClinicIds([]);
    }
  }, [role]);

  // Calcular quantidade de duplicatas
  const duplicatesInfo = useMemo(() => {
    const normalizePhone = (phone: string) => phone.replace(/\D/g, '');
    const phoneMap = new Map<string, number>();
    allLeads.forEach((lead) => {
      const normalizedPhone = normalizePhone(lead.telefone);
      if (normalizedPhone) {
        phoneMap.set(normalizedPhone, (phoneMap.get(normalizedPhone) || 0) + 1);
      }
    });
    const duplicateCount = Array.from(phoneMap.values()).reduce((acc, count) => {
      return count > 1 ? acc + (count - 1) : acc;
    }, 0);
    const hasDuplicates = duplicateCount > 0;
    return { count: duplicateCount, has: hasDuplicates };
  }, [allLeads]);

  const handleFollowUp = (id: string, observacao?: string, etapa?: any) => {
    // sendFollowUp agora já aplica a etapa automaticamente
    sendFollowUp(id, observacao || "", etapa);
  };

  const handleMarkAttendance = (id: string, value: "COMPARECEU" | "NÃO COMPARECEU" | "") => {
    const today = format(new Date(), "dd/MM/yyyy");
    if (value === "COMPARECEU") {
      updateLead(id, {
        comparecimento: "COMPARECEU",
        etapaLead: "Finalizado",
      });
    } else if (value === "NÃO COMPARECEU") {
      const lead = allLeads.find(l => l.id === id);
      // Determina próxima etapa de follow-up
      const etapaAtual = lead?.etapaLead || "";
      const match = etapaAtual.match(/(\d+)$/);
      const numAtual = match ? parseInt(match[1], 10) : 0;
      const proxEtapa: any = numAtual >= 1 ? `Follow-Up ${numAtual + 1}` : "Follow-Up 1";
      updateLead(id, {
        comparecimento: "NÃO COMPARECEU",
        etapaLead: proxEtapa,
        dataFollowUp: today,
      });
    } else {
      // Limpar — só remove o comparecimento
      updateLead(id, { comparecimento: value });
    }
  };

  const handleRegisterCall = (leadId: string, outcome: string, obs: string, returnDate?: string, nextStage?: import("@/types/crm").LeadStage) => {
    registerCall(leadId, outcome, obs, returnDate, nextStage);
  };

  const handleCreateLead = (lead: Omit<Lead, 'id'>) => {
    const created = createLead(lead);
    toast.success(`Lead "${lead.nome}" criado com sucesso!`);
    if (created) setCallLead(created);
  };

  const handleOpenCall = (phone: string) => {
    const clean = (s: string) => s.replace(/\D/g, "");
    const target = clean(phone);
    // find candidates with matching phone (prefer exact or suffix), pick most recently created
    const candidates = leads.filter((l) => {
      const lp = clean(l.telefone);
      return lp === target || lp.endsWith(target) || target.endsWith(lp);
    });
    if (candidates.length === 0) return;
    const chosen = candidates.reduce((best, cur) => {
      const bestTs = Number(best.id.split("_")[1] || 0);
      const curTs = Number(cur.id.split("_")[1] || 0);
      return curTs > bestTs ? cur : best;
    }, candidates[0]);
    setCallLead(chosen);
  };

  const handleReminder = (id: string, type: "h24" | "today") => {
    markReminder(id, type);
    toast.success(`Lembrete ${type} registrado!`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importCSV(file);
      toast.success("Leads importados com sucesso!");
    }
  };

  const handleClearAll = () => {
    clearAllLeads();
    setShowClearDialog(false);
    toast.success("Base de leads limpa!");
  };

  const handleDeleteSelected = () => {
    deleteLeads(selectedLeads);
    setSelectedLeads([]);
    setShowDeleteDialog(false);
    toast.success(`${selectedLeads.length} leads excluídos!`);
  };

  const handleClearDuplicates = () => {
    const removedCount = clearDuplicates();
    setShowClearDuplicatesDialog(false);
    toast.success(`${removedCount} duplicata(s) removida(s)! Mantidos os registros mais recentes.`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-primary rounded-lg p-2 shrink-0">
              <FunnelIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0 flex items-center gap-3">
              <div className="flex flex-col">
                <h1 className="text-xl font-heading font-bold text-foreground">Rede Leads</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">Central de Conversão de Leads • WhatsApp: (17) 99115-4763</p>
              </div>
              <ClinicChip />
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <AuthComponent />
            <button
              onClick={() => setActiveTab('dashboard-executivo')}
              className="ml-2 inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium transition-all bg-secondary/10 text-foreground hover:bg-secondary/20"
              aria-label="Abrir Dashboard Executivo"
            >
              Executivo
            </button>
            {!isReceptionist && (
              <>
                <input type="file" ref={fileRef} accept=".csv" onChange={handleImport} className="hidden" />

                {/* Desktop: compact actions menu (hidden on mobile) */}
                <div className="hidden md:flex gap-2 items-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <CalendarIcon className="h-4 w-4 mr-1" />
                        {format(reportDate, "dd/MM/yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={reportDate}
                        onSelect={(date) => date && setReportDate(date)}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>

                  {/* date-range controls moved to 'Todos os Leads' view */}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreVertical className="h-4 w-4 mr-1" />
                        Ações
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {permissions?.canImport && (
                        <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                          <Download className="h-4 w-4 mr-2" />
                          Importar CSV
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => exportDailyReport(reportDate)}>
                        <FileText className="h-4 w-4 mr-2" />
                        Relatório Diário
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportWeeklyReport(reportDate)}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Relatório Semanal
                      </DropdownMenuItem>
                      {/* Range report moved to 'Todos os Leads' tab */}
                      <DropdownMenuSeparator />
                      {duplicatesInfo.has && permissions?.canDelete && (
                        <DropdownMenuItem onClick={() => setShowClearDuplicatesDialog(true)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Limpar Duplicatas ({duplicatesInfo.count})
                        </DropdownMenuItem>
                      )}
                      {permissions?.canDelete && (
                        <DropdownMenuItem onClick={() => setShowClearDialog(true)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Limpar Base
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {user && (
                        <DropdownMenuItem onClick={() => { /* Admin entry - no-op here */ }}>
                          <Activity className="h-4 w-4 mr-2" />
                          Admin
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {user && <AdminPanel />}
                </div>

                {/* Mobile dropdown — hidden on desktop */}
                <div className="flex md:hidden items-center gap-1">
                  {user && <AdminPanel />}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {permissions?.canImport && (
                        <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                          <Download className="h-4 w-4 mr-2" />
                          Importar CSV
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => exportDailyReport(reportDate)}>
                        <FileText className="h-4 w-4 mr-2" />
                        Relatório Diário
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportWeeklyReport(reportDate)}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Relatório Semanal
                      </DropdownMenuItem>
                      {(duplicatesInfo.has || permissions?.canDelete) && <DropdownMenuSeparator />}
                      {duplicatesInfo.has && permissions?.canDelete && (
                        <DropdownMenuItem onClick={() => setShowClearDuplicatesDialog(true)} className="text-amber-700">
                          <Copy className="h-4 w-4 mr-2" />
                          Limpar Duplicatas ({duplicatesInfo.count})
                        </DropdownMenuItem>
                      )}
                      {permissions?.canDelete && (
                        <DropdownMenuItem onClick={() => setShowClearDialog(true)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Limpar Base
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
            <div className="h-2 w-2 rounded-full bg-primary animate-bounce" />
            Sincronizando dados...
          </div>
        )}
        {isReceptionist ? (
          <AgendaDoDia
            leads={leads}
            onMarkAttendance={handleMarkAttendance}
            onExportWeek={exportWeeklyAppointmentsXlsx}
            onExportFiltered={exportFilteredAppointmentsXlsx}
            onUpdateLead={(id, updates) => updateLead(id, updates)}
          />
        ) : isClient ? (
          <div className="space-y-4 w-full">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Selecionar Clínica:</label>
              <select 
                value={currentClinic || ""} 
                onChange={(e) => setSelectedClinic(e.target.value || null)}
                className="border rounded-lg px-3 py-2 text-sm bg-background"
              >
                <option value="">Todas as clínicas</option>
                {CLINICAS.map((clinic) => (
                  <option key={clinic.id} value={clinic.id}>
                    {clinic.label}
                  </option>
                ))}
              </select>
            </div>
            <Tabs value={clientTab} onValueChange={setClientTab} className="w-full">
              <div className="w-full">
                <TabsList className="w-full sm:max-w-xs justify-start gap-2">
                  <TabsTrigger value="agenda" className="flex items-center gap-1.5">
                    <CalendarCheck className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Agenda do Dia</span>
                  </TabsTrigger>
                  <TabsTrigger value="all-leads" className="flex items-center gap-1.5">
                    <Database className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Todos os Leads</span>
                  </TabsTrigger>
                  <TabsTrigger value="dashboard-executivo" className="flex items-center gap-1.5">
                    <LayoutDashboard className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Dashboard Executivo</span>
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="agenda" className="mt-6">
                <AgendaDoDia
                  leads={leads}
                  onMarkAttendance={handleMarkAttendance}
                  onExportWeek={exportWeeklyAppointmentsXlsx}
                  onExportFiltered={exportFilteredAppointmentsXlsx}
                  onUpdateLead={(id, updates) => updateLead(id, updates)}
                />
              </TabsContent>
              <TabsContent value="all-leads" className="mt-6">
                <AllLeadsView 
                  leads={leads} 
                  onMarkAttendance={handleMarkAttendance}
                  onUpdateLead={(id, updates) => updateLead(id, updates)}
                  onCreateLead={handleCreateLead}
                  selectedLeads={selectedLeads}
                  onSelectionChange={setSelectedLeads}
                  onDeleteSelected={() => setShowDeleteDialog(true)}
                  onClearDuplicates={permissions?.canDelete ? () => setShowClearDuplicatesDialog(true) : undefined}
                  onExport={exportCSV}
                  onExportRange={exportRangeReport}
                  onRegisterCall={handleRegisterCall}
                  onOpenCall={handleOpenCall}
                />
              </TabsContent>
              <TabsContent value="dashboard-executivo" className="mt-6">
                {React.createElement(require("./DashboardExecutivo").default)}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="w-full">
            <TabsList className="w-full sm:max-w-[1100px] justify-start gap-2">
            <TabsTrigger value="dashboard" className="flex items-center gap-1.5">
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="dashboard-executivo" className="flex items-center gap-1.5">
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Dashboard Executivo</span>
            </TabsTrigger>
            <TabsTrigger value="agenda" className="flex items-center gap-1.5">
              <CalendarCheck className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Agenda do Dia</span>
            </TabsTrigger>
            <TabsTrigger value="all-leads" className="flex items-center gap-1.5">
              <Database className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Todos os Leads</span>
            </TabsTrigger>
            <TabsTrigger value="novos-leads" className="flex items-center gap-1.5">
              <Inbox className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Novos Leads</span>
              {newLeadsCount > 0 && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white leading-none">
                  {newLeadsCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="regua-followup" className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Rotina de Contatos</span>
            </TabsTrigger>
            <TabsTrigger value="roi-custos" className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">ROI/Custos</span>
            </TabsTrigger>
            <TabsTrigger value="externos" className="flex items-center gap-1.5">
              <Ticket className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Serviços Externos</span>
            </TabsTrigger>
              {permissions?.canEdit && (
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="ml-auto inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90"
                  aria-label="Novo Lead"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Novo Lead</span>
                </button>
              )}
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-6 mt-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <StatsCards stats={stats} />
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-4 items-start">
              <div className="space-y-4">
                <FollowUpQueue 
                  leads={followUpQueue}
                  allLeads={allLeads}
                  onSendFollowUp={handleFollowUp}
                  onDeleteLead={deleteLead}
                  onRegisterCall={handleRegisterCall}
                  followUpsDoneToday={followUpsDoneToday}
                  followUpGoal={followUpGoal}
                  onCreateLead={handleCreateLead}
                  onUpdateLead={(id, updates) => updateLead(id, updates)}
                />
                {callReturnQueue.length > 0 && (
                  <CallReturnQueue
                    leads={callReturnQueue}
                    onRegisterCall={handleRegisterCall}
                    onClearReturn={clearCallReturn}
                  />
                )}
              </div>
              <CalendarView leads={leads} onMarkReminder={handleReminder} onUpdateLead={(id, updates) => updateLead(id, updates)} />
            </div>

            {/* Gráfico de performance */}
            <PerformanceChart leads={allLeads} />
            <ComparisonChart leads={allLeads} />
          </TabsContent>

          <TabsContent value="dashboard-executivo" className="mt-6">
            {/** Dashboard Executivo com cards inteligentes */}
            {React.createElement(require("./DashboardExecutivo").default)}
          </TabsContent>

          <TabsContent value="agenda" className="mt-6">
            <AgendaDoDia
              leads={leads}
              onMarkAttendance={handleMarkAttendance}
              onExportWeek={exportWeeklyAppointmentsXlsx}
              onExportFiltered={exportFilteredAppointmentsXlsx}
              onUpdateLead={(id, updates) => updateLead(id, updates)}
            />
          </TabsContent>

          <TabsContent value="all-leads" className="mt-6">
            <AllLeadsView 
              leads={leads} 
              onMarkAttendance={handleMarkAttendance}
              onUpdateLead={(id, updates) => updateLead(id, updates)}
              onCreateLead={handleCreateLead}
              selectedLeads={selectedLeads}
              onSelectionChange={setSelectedLeads}
              onDeleteSelected={() => setShowDeleteDialog(true)}
              onClearDuplicates={permissions?.canDelete ? () => setShowClearDuplicatesDialog(true) : undefined}
                onExport={exportCSV}
                onExportRange={exportRangeReport}
              onRegisterCall={handleRegisterCall}
              onOpenCall={handleOpenCall}
            />
          </TabsContent>

          <TabsContent value="novos-leads" className="mt-6">
            <NewLeadsTab onCreateLead={handleCreateLead} onCountChange={setNewLeadsCount} />
          </TabsContent>

          <TabsContent value="regua-followup" className="mt-6">
            <FollowUpRuler
              leads={leads}
              allLeads={allLeads}
              onSendFollowUp={handleFollowUp}
              onRegisterCall={handleRegisterCall}
              onDeleteLead={deleteLead}
              onUpdateLead={(id, updates) => updateLead(id, updates)}
            />
          </TabsContent>

          <TabsContent value="roi-custos" className="mt-6">
            <ROIAnalysisView leads={leads} clinicId={currentClinic ?? user?.uid} />
          </TabsContent>

          <TabsContent value="externos" className="mt-6">
            <ServicosExternos onRegisterCall={handleRegisterCall} />
          </TabsContent>

          {/* Chat content removido */}
        </Tabs>
        )}
      </main>

      {/* Clear All Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar toda a base de leads?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os leads serão permanentemente excluídos do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Limpar Base
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Global Call Log Dialog (openable after creating a lead) */}
      <CallLogDialog
        lead={callLead}
        open={!!callLead}
        onClose={() => setCallLead(null)}
        onConfirm={handleRegisterCall}
      />

      {/* Create Lead Dialog (dashboard shortcut) */}
      <CreateLeadDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSave={(lead) => {
          handleCreateLead(lead);
          setShowCreateDialog(false);
        }}
        onOpenCall={handleOpenCall}
      />

      {/* Delete Selected Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedLeads.length} lead(s) selecionado(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Os leads selecionados serão permanentemente excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Duplicates Dialog */}
      <AlertDialog open={showClearDuplicatesDialog} onOpenChange={setShowClearDuplicatesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar {duplicatesInfo.count} duplicata(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão removidos {duplicatesInfo.count} registro(s) duplicado(s) baseado no número de telefone. 
              Para cada telefone duplicado, apenas o registro mais recente será mantido.
              <br /><br />
              <strong>Esta ação não pode ser desfeita.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearDuplicates} className="bg-amber-600 text-white hover:bg-amber-700">
              Limpar Duplicatas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CRMDashboard;
