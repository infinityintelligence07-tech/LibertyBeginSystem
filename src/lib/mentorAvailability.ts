import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type MentorAvailabilityRow = Database["public"]["Tables"]["mentor_availability"]["Row"];

const PAGE_SIZE = 1000;

export type FetchFreeAvailabilityOpts = {
  /** Inclusive `YYYY-MM-DD` lower bound for `specific_date` slots. */
  fromDate?: string;
  /** Inclusive `YYYY-MM-DD` upper bound for `specific_date` slots. */
  toDate?: string;
  mentorIds?: string[];
};

/**
 * Loads free mentor slots past the PostgREST default 1000-row cap.
 * When a date window is given, returns dated slots inside it plus recurring
 * templates (`is_recurring` with null `specific_date`).
 */
export async function fetchFreeMentorAvailability(
  opts: FetchFreeAvailabilityOpts = {},
): Promise<MentorAvailabilityRow[]> {
  const { fromDate, toDate, mentorIds } = opts;
  const all: MentorAvailabilityRow[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from("mentor_availability")
      .select("*")
      .eq("is_booked", false)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (mentorIds && mentorIds.length > 0) {
      query = query.in("mentor_id", mentorIds);
    }

    if (fromDate || toDate) {
      const dated =
        fromDate && toDate
          ? `and(specific_date.gte.${fromDate},specific_date.lte.${toDate})`
          : fromDate
            ? `specific_date.gte.${fromDate}`
            : `specific_date.lte.${toDate}`;
      query = query.or(`${dated},and(is_recurring.eq.true,specific_date.is.null)`);
    }

    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}
