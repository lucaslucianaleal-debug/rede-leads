import { describe, expect, it } from "vitest";
import { cadenceLabel, getNextFollowUpDate } from "../../shared/followUpCadence.js";

describe("follow-up cadence", () => {
  const friday = new Date("2026-09-04T15:00:00.000Z");

  it("spaces the early stages instead of returning every lead the next day", () => {
    expect(getNextFollowUpDate(friday, "Follow-Up 2", "Follow-Up 3")).toBe("07/09/2026");
    expect(getNextFollowUpDate(friday, "Follow-Up 3", "Follow-Up 4")).toBe("09/09/2026");
  });

  it("moves weekend dates to Monday", () => {
    expect(getNextFollowUpDate(friday, "Follow-Up 11", "Follow-Up 12")).toBe("05/10/2026");
  });

  it("finishes the active cadence after D12", () => {
    expect(getNextFollowUpDate(friday, "Follow-Up 12", "Follow-Up 12")).toBe("");
  });

  it("returns the label used by the cadence screen", () => {
    expect(cadenceLabel("Follow-Up 9")).toBe("+15 dias");
  });
});
