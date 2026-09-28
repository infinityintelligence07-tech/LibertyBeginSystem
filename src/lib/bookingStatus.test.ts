import { describe, expect, it } from "vitest";
import { getEffectiveBookingStatus, getMentorPendingAction } from "./bookingStatus";

const now = new Date("2026-09-28T18:00:00Z"); // 15:00 em São Paulo

describe("getEffectiveBookingStatus", () => {
  it("Mapeamento que passou sem o mentor fechar fica a confirmar (não conta como realizado)", () => {
    const kickoff = { status: "scheduled", scheduled_date: "2026-09-28", start_time: "09:00", end_time: "12:00", report_required: false };
    expect(getEffectiveBookingStatus(kickoff, { now })).toBe("pending_confirmation");
    expect(getMentorPendingAction(kickoff, false, now)).toBe("confirm");
  });

  it("Mapeamento marcado como realizado conta como realizado sem pedir relatório", () => {
    const kickoff = { status: "completed", scheduled_date: "2026-09-28", start_time: "09:00", end_time: "12:00", report_required: false };
    expect(getEffectiveBookingStatus(kickoff, { now, hasReport: false })).toBe("completed");
    expect(getMentorPendingAction(kickoff, false, now)).toBeNull();
  });

  it("histórico anterior a 01/08/2026 e retroativo continuam contando como realizados", () => {
    expect(getEffectiveBookingStatus({ status: "scheduled", scheduled_date: "2026-07-10", start_time: "09:00", end_time: "10:30" }, { now })).toBe("completed");
    expect(getEffectiveBookingStatus({ status: "scheduled", scheduled_date: "2026-09-01", start_time: "09:00", end_time: "10:30", is_retroactive: true }, { now })).toBe("completed");
  });

  it("sessão futura continua agendada", () => {
    expect(getEffectiveBookingStatus({ status: "scheduled", scheduled_date: "2026-09-30", start_time: "09:00", end_time: "10:30" }, { now })).toBe("scheduled");
  });
});
