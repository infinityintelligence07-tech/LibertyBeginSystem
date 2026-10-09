import { describe, expect, it } from "vitest";
import { sessionFee, sessionFeeMultiplier } from "./mentorFees";

const ratesAfterChange = { sessionValue: 300, kickoffValue: 450 };

describe("sessionFeeMultiplier", () => {
  it("Mapeamento do Negócio (kickoff) paga o valor de kickoff", () => {
    expect(sessionFeeMultiplier({ session_name: "Mapeamento do Negócio", is_kickoff: true, duration_minutes: 180 })).toBe(2);
  });

  it("Mapa do Negócio (sessão antiga) paga como sessão normal", () => {
    expect(sessionFeeMultiplier({ session_name: "Mapa do Negócio", is_kickoff: false, duration_minutes: 90 })).toBe(1);
  });

  it("Onboarding não é remunerado", () => {
    expect(sessionFeeMultiplier({ session_name: "Onboarding", duration_minutes: 60 })).toBe(0);
  });

  it("mapeamento até setembro/2026 permanece em R$ 600", () => {
    expect(sessionFee(300, {
      session_name: "Mapeamento do Negócio",
      is_kickoff: true,
      duration_minutes: 180,
      scheduled_date: "2026-09-30",
    }, ratesAfterChange)).toBe(600);
  });

  it("mapeamento a partir de outubro/2026 usa o valor atual", () => {
    expect(sessionFee(300, {
      session_name: "Mapeamento do Negócio",
      is_kickoff: true,
      duration_minutes: 180,
      scheduled_date: "2026-10-01",
    }, ratesAfterChange)).toBe(450);
  });
});
