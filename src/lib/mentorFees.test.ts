import { describe, expect, it } from "vitest";
import { sessionFeeMultiplier } from "./mentorFees";

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
});
