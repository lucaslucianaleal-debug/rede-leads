import type { Lead } from "@/types/crm";

const APPOINTMENT_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/;
const CLOSED_STAGES = new Set(["desistência", "desistencia", "fora da região", "fora da regiao", "finalizado"]);

export function appointmentConflicts(
  leads: Lead[],
  appointmentValue: string,
  currentLeadId?: string,
) {
  if (!APPOINTMENT_PATTERN.test(String(appointmentValue || "").trim())) return [];

  return (Array.isArray(leads) ? leads : []).filter((lead) => {
    if (!lead || lead.id === currentLeadId || lead._deleted) return false;
    if (CLOSED_STAGES.has(String(lead.etapaLead || "").trim().toLowerCase())) return false;
    return String(lead.dataAgendamento || "").trim() === appointmentValue;
  });
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(total: number) {
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function suggestAvailableTimes(
  leads: Lead[],
  dateValue: string,
  selectedTime: string,
  currentLeadId?: string,
  limit = 3,
) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(selectedTime)) return [];

  const dayAppointments = new Set(
    (Array.isArray(leads) ? leads : [])
      .filter((lead) => lead && lead.id !== currentLeadId && !lead._deleted)
      .filter((lead) => !CLOSED_STAGES.has(String(lead.etapaLead || "").trim().toLowerCase()))
      .map((lead) => String(lead.dataAgendamento || "").trim())
      .filter((value) => value.startsWith(`${dateValue} `)),
  );

  const selectedMinutes = timeToMinutes(selectedTime);
  const openingMinutes = 8 * 60;
  const closingMinutes = 18 * 60;
  const candidates: number[] = [];

  for (let minutes = selectedMinutes + 30; minutes <= closingMinutes; minutes += 30) candidates.push(minutes);
  for (let minutes = selectedMinutes - 30; minutes >= openingMinutes; minutes -= 30) candidates.push(minutes);

  return candidates
    .filter((minutes) => minutes >= openingMinutes && minutes <= closingMinutes)
    .map(minutesToTime)
    .filter((time) => !dayAppointments.has(`${dateValue} ${time}`))
    .slice(0, Math.max(0, limit));
}
