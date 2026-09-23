export type MPCClinicReportType = "budgets_sales" | "ortho_sales" | "completed";
export type MPCClinicMatchMethod = "cpf" | "phone" | "name";

export interface MPCClinicLeadLink {
  leadId: string;
  method: MPCClinicMatchMethod;
  crmName: string;
  crmPhone?: string;
  crmAppointmentDate?: string;
  crmComparecimento?: string;
  metaCampanhaId?: string;
  metaCampanhaNome?: string;
  fonteLead?: string;
  servicoProcurado?: string;
  sameDayAppointment?: boolean;
}

export interface MPCClinicBudgetSalesRow {
  patientName: string;
  cpf: string;
  budgets: number;
  sales: number;
  particular: number;
  odc: number;
  link?: MPCClinicLeadLink;
}

export interface MPCClinicBudgetSalesSnapshot {
  id: string;
  sourceFile: string;
  periodStart: string;
  periodEnd: string;
  importedAt: string;
  rows: MPCClinicBudgetSalesRow[];
  totals: {
    budgets: number;
    sales: number;
    particular: number;
    odc: number;
  };
}

export interface MPCClinicSaleRecord {
  id: string;
  sourceFile: string;
  importedAt: string;
  externalDoc: string;
  cpf: string;
  patientName: string;
  saleDate: string;
  type: "VENDA" | "COMPLEMENTO";
  modality: string;
  value: number;
  phone?: string;
  startDate?: string;
  link?: MPCClinicLeadLink;
}

export interface MPCClinicProcedureRecord {
  id: string;
  sourceFile: string;
  importedAt: string;
  dentistCode: string;
  dentistName: string;
  patientName: string;
  externalDoc: string;
  procedureNo: string;
  service: string;
  tooth?: string;
  value: number;
  completedAt: string;
  link?: MPCClinicLeadLink;
}

export interface MPCClinicReportImport {
  id: string;
  type: MPCClinicReportType;
  fileName: string;
  periodStart: string;
  periodEnd: string;
  importedAt: string;
  rowCount: number;
  linkedCount: number;
  unmatchedCount: number;
  sameDayConfirmedCount?: number;
}
