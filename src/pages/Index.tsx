import { useLeads } from "@/hooks/useLeads";
import { useAuth } from "@/hooks/useAuth";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useConversations } from "@/hooks/useConversations";
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
import { Download, Activity, Calendar as CalendarIcon, LayoutDashboard, Database, Trash2, Copy, FileText, FileSpreadsheet, CalendarCheck, MoreVertical, MessageCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FunnelIcon } from "@/components/FunnelIcon";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRef, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const CRMDashboard = () => {
  const { user } = useAuth();
  const { permissions, isReceptionist } = useUserPermissions();
  const {
    leads,
    stats,
    callReturnQueue,
    followUpQueue,
    followUpsDoneToday,
    followUpGoal,
    reminderQueue,
    sendFollowUp,
    markReminder,
    updateLead,
    clearCallReturn,
    registerCall,
    exportAppointments,
    exportDailyReport,
    exportWeeklyReport,
    importCSV,
    deleteLeads,
    clearAllLeads,
    clearDuplicates,
    allLeads,
  } = useLeads();

  const { totalUnread } = useConversations();

  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClearDuplicatesDialog, setShowClearDuplicatesDialog] = useState(false);
  const [reportDate, setReportDate] = useState<Date>(new Date());

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

  const handleFollowUp = (id: string, observacao?: string) => {
    sendFollowUp(id, observacao || "");
  };

  const handleRegisterCall = (leadId: string, outcome: string, obs: string, returnDate?: string) => {
    registerCall(leadId, outcome, obs, returnDate);
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
            <div className="min-w-0">
              <h1 className="text-xl font-heading font-bold text-foreground">Rede Leads</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Central de Conversão de Leads • WhatsApp: (17) 99115-4763</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <AuthComponent />
            {!isReceptionist && (
              <>
                <input type="file" ref={fileRef} accept=".csv" onChange={handleImport} className="hidden" />

                {/* Desktop buttons — hidden on mobile */}
                <div className="hidden md:flex gap-2 items-center">
                  {permissions?.canImport && (
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                      <Download className="h-4 w-4 mr-1" />
                      Importar CSV
                    </Button>
                  )}
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
                  <Button variant="default" size="sm" onClick={() => exportDailyReport(reportDate)}>
                    <FileText className="h-4 w-4 mr-1" />
                    Relatório Diário
                  </Button>
                  <Button variant="default" size="sm" onClick={() => exportWeeklyReport(reportDate)}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                    Relatório Semanal
                  </Button>
                  {duplicatesInfo.has && permissions?.canDelete && (
                    <Button variant="outline" size="sm" onClick={() => setShowClearDuplicatesDialog(true)} className="border-amber-500 text-amber-700 hover:bg-amber-50">
                      <Copy className="h-4 w-4 mr-1" />
                      Limpar Duplicatas ({duplicatesInfo.count})
                    </Button>
                  )}
                  {permissions?.canDelete && (
                    <Button variant="destructive" size="sm" onClick={() => setShowClearDialog(true)}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Limpar Base
                    </Button>
                  )}
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
        {isReceptionist ? (
          <AgendaDoDia
            leads={leads}
            onMarkAttendance={(id, value) => updateLead(id, { comparecimento: value })}
          />
        ) : (
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full sm:max-w-[900px] grid-cols-5">
            <TabsTrigger value="dashboard" className="flex items-center gap-1.5">
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="agenda" className="flex items-center gap-1.5">
              <CalendarCheck className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Agenda do Dia</span>
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-1.5">
              <CalendarIcon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Calendário</span>
            </TabsTrigger>
            <TabsTrigger value="all-leads" className="flex items-center gap-1.5">
              <Database className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Todos os Leads</span>
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-1.5 relative">
              <MessageCircle className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Chat</span>
              {totalUnread > 0 && (
                <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {totalUnread > 9 ? "9+" : totalUnread}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6 mt-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <StatsCards stats={stats} />
            </motion.div>

            <div className="grid md:grid-cols-2 gap-4">
              <FollowUpQueue 
                leads={followUpQueue} 
                onSendFollowUp={handleFollowUp}
                onRegisterCall={handleRegisterCall}
                followUpsDoneToday={followUpsDoneToday}
                followUpGoal={followUpGoal}
              />
              <ReminderQueue leads={reminderQueue} onMarkReminder={handleReminder} />
            </div>
            {callReturnQueue.length > 0 && (
              <CallReturnQueue
                leads={callReturnQueue}
                onRegisterCall={handleRegisterCall}
                onClearReturn={clearCallReturn}
              />
            )}
          </TabsContent>

          <TabsContent value="agenda" className="mt-6">
            <AgendaDoDia
              leads={leads}
              onMarkAttendance={(id, value) => updateLead(id, { comparecimento: value })}
            />
          </TabsContent>

          <TabsContent value="calendar" className="mt-6">
            <CalendarView leads={leads} onMarkReminder={markReminder} onUpdateLead={(id, updates) => updateLead(id, updates)} />
          </TabsContent>

          <TabsContent value="all-leads" className="mt-6">
            <AllLeadsView 
              leads={leads} 
              onMarkAttendance={(id, value) => updateLead(id, { comparecimento: value })}
              onUpdateLead={updateLead}
              selectedLeads={selectedLeads}
              onSelectionChange={setSelectedLeads}
              onDeleteSelected={() => setShowDeleteDialog(true)}
              onClearDuplicates={permissions?.canDelete ? () => setShowClearDuplicatesDialog(true) : undefined}
              onSendFollowUp={handleFollowUp}
              onRegisterCall={handleRegisterCall}
            />
          </TabsContent>

          <TabsContent value="chat">
            <ChatView />
          </TabsContent>
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
