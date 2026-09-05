const TIME_ZONE = "America/Sao_Paulo";

export const FOLLOW_UP_CADENCE_DAYS = Object.freeze({
  "Follow-Up 1": 1,
  "Follow-Up 2": 2,
  "Follow-Up 3": 3,
  "Follow-Up 4": 5,
  "Follow-Up 5": 7,
  "Follow-Up 6": 7,
  "Follow-Up 7": 10,
  "Follow-Up 8": 10,
  "Follow-Up 9": 15,
  "Follow-Up 10": 20,
  "Follow-Up 11": 20,
  "Follow-Up 12": 30,
});

function zonedDateParts(date, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function formatUtcDate(date) {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

export function getCadenceDays(nextStage) {
  return FOLLOW_UP_CADENCE_DAYS[String(nextStage || "")] || 1;
}

export function getNextFollowUpDate(sentAt, currentStage, nextStage) {
  if (/^Follow-Up\s+12$/i.test(String(currentStage || ""))) return "";

  const date = sentAt instanceof Date ? sentAt : new Date(sentAt);
  if (Number.isNaN(date.getTime())) return "";

  const { year, month, day } = zonedDateParts(date);
  const next = new Date(Date.UTC(year, month - 1, day, 12));
  next.setUTCDate(next.getUTCDate() + getCadenceDays(nextStage));

  // A rotina comercial volta na segunda quando a data calculada cai no fim de semana.
  if (next.getUTCDay() === 6) next.setUTCDate(next.getUTCDate() + 2);
  if (next.getUTCDay() === 0) next.setUTCDate(next.getUTCDate() + 1);

  return formatUtcDate(next);
}

export function cadenceLabel(stage) {
  const days = getCadenceDays(stage);
  return `+${days} ${days === 1 ? "dia" : "dias"}`;
}
