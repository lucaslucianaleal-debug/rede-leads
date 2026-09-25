export const OPEN_FINANCE_PATIENT_EVENT = "clinic-finance-open-patient";

export function openFinancePatient(patientId: string) {
  if (typeof window === "undefined" || !patientId) return;
  window.dispatchEvent(new CustomEvent(OPEN_FINANCE_PATIENT_EVENT, { detail: { patientId } }));
}
