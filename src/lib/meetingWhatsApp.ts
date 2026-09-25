import { supabase } from "@/integrations/supabase/client";

/** Helpers para lembretes WhatsApp de sessão (Meet). */

export function digitsPhone(phone?: string | null): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d;
}

export function whatsappHref(phone: string | null | undefined, text: string): string | null {
  const digits = digitsPhone(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export type ProvisionMeetingResult = {
  ok?: boolean;
  meet_url?: string;
  error?: string;
  message?: string;
  reused?: boolean;
  skipped?: boolean;
};

/** Dispara provision-meeting. */
export async function invokeProvisionMeeting(
  bookingId: string,
  opts?: { force?: boolean },
): Promise<ProvisionMeetingResult> {
  const { data, error } = await supabase.functions.invoke("provision-meeting", {
    body: { booking_id: bookingId, force: opts?.force === true },
  });
  if (error) {
    console.warn("provision-meeting", error);
    return { ok: false, error: error.message };
  }
  return (data || {}) as ProvisionMeetingResult;
}
