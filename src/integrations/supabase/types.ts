export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      booking_reports: {
        Row: {
          action_plan: string | null
          ai_insights: string | null
          booking_id: string
          created_at: string
          delivered: string | null
          goals: string | null
          id: string
          mentor_impressions: string | null
          next_steps: string | null
          pdf_delivered_at: string | null
          pdf_delivery_method: string | null
          summary: string | null
          tool_attachment_url: string | null
          tool_link: string | null
          updated_at: string
        }
        Insert: {
          action_plan?: string | null
          ai_insights?: string | null
          booking_id: string
          created_at?: string
          delivered?: string | null
          goals?: string | null
          id?: string
          mentor_impressions?: string | null
          next_steps?: string | null
          pdf_delivered_at?: string | null
          pdf_delivery_method?: string | null
          summary?: string | null
          tool_attachment_url?: string | null
          tool_link?: string | null
          updated_at?: string
        }
        Update: {
          action_plan?: string | null
          ai_insights?: string | null
          booking_id?: string
          created_at?: string
          delivered?: string | null
          goals?: string | null
          id?: string
          mentor_impressions?: string | null
          next_steps?: string | null
          pdf_delivered_at?: string | null
          pdf_delivery_method?: string | null
          summary?: string | null
          tool_attachment_url?: string | null
          tool_link?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_reports_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          approval_required: boolean
          availability_id: string | null
          cancellation_reason: string | null
          created_at: string
          created_by: string | null
          end_time: string
          google_event_id_institutional: string | null
          google_event_id_liberty: string | null
          google_event_id_mentor: string | null
          guest_name: string | null
          guest_email: string | null
          id: string
          is_retroactive: boolean
          liberty_id: string | null
          mentor_id: string
          observations: string | null
          pending_reminder_sent_at: string | null
          reminder_24h_sent_at: string | null
          report_required: boolean
          scheduled_date: string
          session_id: string
          start_time: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          zoom_join_url: string | null
          zoom_link: string | null
          meeting_provider: string | null
          meeting_host_id: string | null
          meeting_space_name: string | null
          meeting_calendar_event_id: string | null
          meeting_wa_member_text: string | null
          meeting_wa_mentor_text: string | null
          meeting_provisioned_at: string | null
          meeting_provision_error: string | null
          meeting_transcript_text: string | null
          meeting_artifacts_status: string | null
          meeting_artifacts_fetched_at: string | null
          meeting_ended_at: string | null
        }
        Insert: {
          approval_required?: boolean
          availability_id?: string | null
          cancellation_reason?: string | null
          created_at?: string
          created_by?: string | null
          end_time: string
          google_event_id_institutional?: string | null
          google_event_id_liberty?: string | null
          google_event_id_mentor?: string | null
          guest_name?: string | null
          guest_email?: string | null
          id?: string
          is_retroactive?: boolean
          liberty_id?: string | null
          mentor_id: string
          observations?: string | null
          pending_reminder_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          report_required?: boolean
          scheduled_date: string
          session_id: string
          start_time: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          zoom_join_url?: string | null
          zoom_link?: string | null
          meeting_provider?: string | null
          meeting_host_id?: string | null
          meeting_space_name?: string | null
          meeting_calendar_event_id?: string | null
          meeting_wa_member_text?: string | null
          meeting_wa_mentor_text?: string | null
          meeting_provisioned_at?: string | null
          meeting_provision_error?: string | null
          meeting_transcript_text?: string | null
          meeting_artifacts_status?: string | null
          meeting_artifacts_fetched_at?: string | null
          meeting_ended_at?: string | null
        }
        Update: {
          approval_required?: boolean
          availability_id?: string | null
          cancellation_reason?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string
          google_event_id_institutional?: string | null
          google_event_id_liberty?: string | null
          google_event_id_mentor?: string | null
          guest_name?: string | null
          guest_email?: string | null
          id?: string
          is_retroactive?: boolean
          liberty_id?: string | null
          mentor_id?: string
          observations?: string | null
          pending_reminder_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          report_required?: boolean
          scheduled_date?: string
          session_id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          zoom_join_url?: string | null
          zoom_link?: string | null
          meeting_provider?: string | null
          meeting_host_id?: string | null
          meeting_space_name?: string | null
          meeting_calendar_event_id?: string | null
          meeting_wa_member_text?: string | null
          meeting_wa_mentor_text?: string | null
          meeting_provisioned_at?: string | null
          meeting_provision_error?: string | null
          meeting_transcript_text?: string | null
          meeting_artifacts_status?: string | null
          meeting_artifacts_fetched_at?: string | null
          meeting_ended_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_availability_id_fkey"
            columns: ["availability_id"]
            isOneToOne: false
            referencedRelation: "mentor_availability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_liberty_id_fkey"
            columns: ["liberty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_liberty_id_fkey"
            columns: ["liberty_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_meeting_host_id_fkey"
            columns: ["meeting_host_id"]
            isOneToOne: false
            referencedRelation: "meeting_hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      contents: {
        Row: {
          content_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          phase_unlock: number | null
          pillar: string | null
          session_id: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          content_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          phase_unlock?: number | null
          pillar?: string | null
          session_id?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          phase_unlock?: number | null
          pillar?: string | null
          session_id?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance: {
        Row: {
          created_at: string
          event_id: string
          guests: number
          id: string
          note: string | null
          profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          guests?: number
          id?: string
          note?: string | null
          profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          guests?: number
          id?: string
          note?: string | null
          profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          event_date: string
          event_time: string | null
          id: string
          is_online: boolean | null
          is_visible: boolean | null
          location: string | null
          location_url: string | null
          rsvp_deadline: string | null
          rsvp_enabled: boolean
          title: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          is_online?: boolean | null
          is_visible?: boolean | null
          location?: string | null
          location_url?: string | null
          rsvp_deadline?: string | null
          rsvp_enabled?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          is_online?: boolean | null
          is_visible?: boolean | null
          location?: string | null
          location_url?: string | null
          rsvp_deadline?: string | null
          rsvp_enabled?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      featured_case_of_day: {
        Row: {
          case_date: string
          created_at: string
          headline: string
          id: string
          member_id: string
          metric_label: string | null
          metric_value: string | null
          source_booking_id: string | null
          source_testimonial_id: string | null
          summary: string
        }
        Insert: {
          case_date: string
          created_at?: string
          headline: string
          id?: string
          member_id: string
          metric_label?: string | null
          metric_value?: string | null
          source_booking_id?: string | null
          source_testimonial_id?: string | null
          summary: string
        }
        Update: {
          case_date?: string
          created_at?: string
          headline?: string
          id?: string
          member_id?: string
          metric_label?: string | null
          metric_value?: string | null
          source_booking_id?: string | null
          source_testimonial_id?: string | null
          summary?: string
        }
        Relationships: []
      }
      meeting_hosts: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          label: string
          profile_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          label: string
          profile_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          label?: string
          profile_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_hosts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_hosts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_points: {
        Row: {
          created_at: string
          id: string
          member_id: string
          points: number
          reason: string
          related_booking_id: string | null
          related_task_id: string | null
          related_testimonial_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          points: number
          reason: string
          related_booking_id?: string | null
          related_task_id?: string | null
          related_testimonial_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          points?: number
          reason?: string
          related_booking_id?: string | null
          related_task_id?: string | null
          related_testimonial_id?: string | null
        }
        Relationships: []
      }
      member_testimonials: {
        Row: {
          content: string
          created_at: string
          headline: string
          id: string
          is_public: boolean
          member_id: string
          result_metric: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          headline: string
          id?: string
          is_public?: boolean
          member_id: string
          result_metric?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          headline?: string
          id?: string
          is_public?: boolean
          member_id?: string
          result_metric?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mentor_availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_booked: boolean
          is_recurring: boolean
          mentor_id: string
          specific_date: string | null
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_booked?: boolean
          is_recurring?: boolean
          mentor_id: string
          specific_date?: string | null
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_booked?: boolean
          is_recurring?: boolean
          mentor_id?: string
          specific_date?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_availability_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_availability_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_sessions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          mentor_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          mentor_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          mentor_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_sessions_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_sessions_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_sessions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string | null
          read_at: string | null
          related_booking_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read_at?: string | null
          related_booking_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read_at?: string | null
          related_booking_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nps_mentor_options: {
        Row: {
          full_name: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          full_name: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          full_name?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_mentor_options_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_mentor_options_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          improvements: string | null
          key_takeaway: string | null
          liberty_id: string
          liberty_name: string | null
          liberty_whatsapp: string | null
          mentor_id: string | null
          mentor_name: string | null
          score_action_plan: number | null
          score_content: number | null
          score_mentor: number | null
          score_overall: number | null
          score_tool: number | null
          session_id: string | null
          session_name: string | null
          updated_at: string
          would_recommend: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          improvements?: string | null
          key_takeaway?: string | null
          liberty_id: string
          liberty_name?: string | null
          liberty_whatsapp?: string | null
          mentor_id?: string | null
          mentor_name?: string | null
          score_action_plan?: number | null
          score_content?: number | null
          score_mentor?: number | null
          score_overall?: number | null
          score_tool?: number | null
          session_id?: string | null
          session_name?: string | null
          updated_at?: string
          would_recommend?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          improvements?: string | null
          key_takeaway?: string | null
          liberty_id?: string
          liberty_name?: string | null
          liberty_whatsapp?: string | null
          mentor_id?: string | null
          mentor_name?: string | null
          score_action_plan?: number | null
          score_content?: number | null
          score_mentor?: number | null
          score_overall?: number | null
          score_tool?: number | null
          session_id?: string | null
          session_name?: string | null
          updated_at?: string
          would_recommend?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_liberty_id_fkey"
            columns: ["liberty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_liberty_id_fkey"
            columns: ["liberty_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_merge_log: {
        Row: {
          created_at: string
          id: string
          loser_before: Json
          loser_id: string
          loser_name: string | null
          moved: Json
          performed_by: string | null
          undone_at: string | null
          undone_by: string | null
          updated_at: string
          winner_before: Json
          winner_id: string
          winner_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          loser_before: Json
          loser_id: string
          loser_name?: string | null
          moved?: Json
          performed_by?: string | null
          undone_at?: string | null
          undone_by?: string | null
          updated_at?: string
          winner_before: Json
          winner_id: string
          winner_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          loser_before?: Json
          loser_id?: string
          loser_name?: string | null
          moved?: Json
          performed_by?: string | null
          undone_at?: string | null
          undone_by?: string | null
          updated_at?: string
          winner_before?: Json
          winner_id?: string
          winner_name?: string | null
        }
        Relationships: []
      }
      profile_user_lookup: {
        Row: {
          profile_id: string
          user_id: string
        }
        Insert: {
          profile_id: string
          user_id: string
        }
        Update: {
          profile_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_user_lookup_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_user_lookup_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          admin_note: string | null
          avatar_url: string | null
          birth_date: string | null
          business_age: string | null
          business_description: string | null
          business_story: string | null
          challenge_2026: string | null
          city_state: string | null
          company_address: string | null
          company_instagram: string | null
          company_name: string | null
          company_segment: string | null
          costs_expenses: string | null
          courtesy_reschedules_left: number
          created_at: string
          dietary_restriction: string | null
          dream_2026: string | null
          email: string | null
          employees_count: string | null
          employees_count_num: number | null
          favorite_chocolate: string | null
          featured_position: number | null
          financial_challenge: string | null
          financial_control: string | null
          full_name: string
          google_calendar_email: string | null
          google_connected: boolean
          id: string
          instagram_personal: string | null
          is_active: boolean
          is_ranking_featured: boolean
          leaders_count: number | null
          main_pain: string | null
          marital_status: string | null
          member_tier: Database["public"]["Enums"]["member_tier"] | null
          monthly_revenue: string | null
          onboarding_completed: boolean
          personal_story: string | null
          phone: string | null
          profit_margin: string | null
          program_end_date: string | null
          program_expectation: string | null
          program_start_date: string | null
          sector_to_develop: string | null
          session_rate: number | null
          updated_at: string
          user_id: string | null
          uses_dre: string | null
          vision_6_months: string | null
          would_buy_self: string | null
        }
        Insert: {
          admin_note?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          business_age?: string | null
          business_description?: string | null
          business_story?: string | null
          challenge_2026?: string | null
          city_state?: string | null
          company_address?: string | null
          company_instagram?: string | null
          company_name?: string | null
          company_segment?: string | null
          costs_expenses?: string | null
          courtesy_reschedules_left?: number
          created_at?: string
          dietary_restriction?: string | null
          dream_2026?: string | null
          email?: string | null
          employees_count?: string | null
          employees_count_num?: number | null
          favorite_chocolate?: string | null
          featured_position?: number | null
          financial_challenge?: string | null
          financial_control?: string | null
          full_name: string
          google_calendar_email?: string | null
          google_connected?: boolean
          id?: string
          instagram_personal?: string | null
          is_active?: boolean
          is_ranking_featured?: boolean
          leaders_count?: number | null
          main_pain?: string | null
          marital_status?: string | null
          member_tier?: Database["public"]["Enums"]["member_tier"] | null
          monthly_revenue?: string | null
          onboarding_completed?: boolean
          personal_story?: string | null
          phone?: string | null
          profit_margin?: string | null
          program_end_date?: string | null
          program_expectation?: string | null
          program_start_date?: string | null
          sector_to_develop?: string | null
          session_rate?: number | null
          updated_at?: string
          user_id?: string | null
          uses_dre?: string | null
          vision_6_months?: string | null
          would_buy_self?: string | null
        }
        Update: {
          admin_note?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          business_age?: string | null
          business_description?: string | null
          business_story?: string | null
          challenge_2026?: string | null
          city_state?: string | null
          company_address?: string | null
          company_instagram?: string | null
          company_name?: string | null
          company_segment?: string | null
          costs_expenses?: string | null
          courtesy_reschedules_left?: number
          created_at?: string
          dietary_restriction?: string | null
          dream_2026?: string | null
          email?: string | null
          employees_count?: string | null
          employees_count_num?: number | null
          favorite_chocolate?: string | null
          featured_position?: number | null
          financial_challenge?: string | null
          financial_control?: string | null
          full_name?: string
          google_calendar_email?: string | null
          google_connected?: boolean
          id?: string
          instagram_personal?: string | null
          is_active?: boolean
          is_ranking_featured?: boolean
          leaders_count?: number | null
          main_pain?: string | null
          marital_status?: string | null
          member_tier?: Database["public"]["Enums"]["member_tier"] | null
          monthly_revenue?: string | null
          onboarding_completed?: boolean
          personal_story?: string | null
          phone?: string | null
          profit_margin?: string | null
          program_end_date?: string | null
          program_expectation?: string | null
          program_start_date?: string | null
          sector_to_develop?: string | null
          session_rate?: number | null
          updated_at?: string
          user_id?: string | null
          uses_dre?: string | null
          vision_6_months?: string | null
          would_buy_self?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          token: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          token: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          token?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      session_tasks: {
        Row: {
          assignee_name: string | null
          booking_id: string
          completed_at: string | null
          completed_by_role: string | null
          created_at: string | null
          created_by_mentor_id: string | null
          description: string
          due_date: string | null
          id: string
          in_progress: boolean
          is_completed: boolean | null
          origin: string
          planned_date: string | null
          result_metric: string | null
          result_notes: string | null
          result_type: string | null
          result_value: string | null
          updated_at: string | null
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          assignee_name?: string | null
          booking_id: string
          completed_at?: string | null
          completed_by_role?: string | null
          created_at?: string | null
          created_by_mentor_id?: string | null
          description: string
          due_date?: string | null
          id?: string
          in_progress?: boolean
          is_completed?: boolean | null
          origin?: string
          planned_date?: string | null
          result_metric?: string | null
          result_notes?: string | null
          result_type?: string | null
          result_value?: string | null
          updated_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          assignee_name?: string | null
          booking_id?: string
          completed_at?: string | null
          completed_by_role?: string | null
          created_at?: string | null
          created_by_mentor_id?: string | null
          description?: string
          due_date?: string | null
          id?: string
          in_progress?: boolean
          is_completed?: boolean | null
          origin?: string
          planned_date?: string | null
          result_metric?: string | null
          result_notes?: string | null
          result_type?: string | null
          result_value?: string | null
          updated_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_tasks_created_by_mentor_id_fkey"
            columns: ["created_by_mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_tasks_created_by_mentor_id_fkey"
            columns: ["created_by_mentor_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_tasks_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_tasks_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          is_kickoff: boolean
          name: string
          order: number
          pillar: string | null
          tier: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_kickoff?: boolean
          name: string
          order?: number
          pillar?: string | null
          tier?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_kickoff?: boolean
          name?: string
          order?: number
          pillar?: string | null
          tier?: string
        }
        Relationships: []
      }
      student_tools: {
        Row: {
          booking_id: string | null
          created_at: string
          description: string | null
          external_url: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_type: string
          id: string
          liberty_id: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          description?: string | null
          external_url?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type: string
          id?: string
          liberty_id: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          description?: string | null
          external_url?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string
          id?: string
          liberty_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_tools_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_tools_liberty_id_fkey"
            columns: ["liberty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_tools_liberty_id_fkey"
            columns: ["liberty_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_tools_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_tools_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      tool_applications: {
        Row: {
          answers: Json
          applied_by: string | null
          completed_at: string | null
          created_at: string
          id: string
          member_id: string
          notes: string | null
          phase: string
          scores: Json
          status: string
          template_id: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          applied_by?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          member_id: string
          notes?: string | null
          phase?: string
          scores?: Json
          status?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          applied_by?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          member_id?: string
          notes?: string | null
          phase?: string
          scores?: Json
          status?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_applications_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_applications_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_applications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_applications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_applications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tool_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_templates: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          result_type: string
          schema: Json
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          result_type?: string
          schema?: Json
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          result_type?: string
          schema?: Json
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_oauth_tokens: {
        Row: {
          google_refresh_token: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          google_refresh_token?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          google_refresh_token?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_oauth_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_oauth_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "public_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_member_profiles: {
        Row: {
          avatar_url: string | null
          company_instagram: string | null
          company_name: string | null
          company_segment: string | null
          full_name: string | null
          id: string | null
          member_tier: Database["public"]["Enums"]["member_tier"] | null
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_instagram?: string | null
          company_name?: string | null
          company_segment?: string | null
          full_name?: string | null
          id?: string | null
          member_tier?: Database["public"]["Enums"]["member_tier"] | null
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_instagram?: string | null
          company_name?: string | null
          company_segment?: string | null
          full_name?: string | null
          id?: string | null
          member_tier?: Database["public"]["Enums"]["member_tier"] | null
          phone?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _notif_user_id: { Args: { _profile_id: string }; Returns: string }
      dispatch_availability_nudges: { Args: never; Returns: undefined }
      dispatch_booking_reminders: { Args: never; Returns: undefined }
      dispatch_report_nudges: { Args: never; Returns: undefined }
      get_ranking_board: {
        Args: never
        Returns: {
          avatar_url: string
          company_name: string
          featured_position: number
          full_name: string
          id: string
          is_ranking_featured: boolean
          member_tier: string
        }[]
      }
      get_ranking_totals: {
        Args: never
        Returns: {
          member_id: string
          points: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_tool_members: {
        Args: never
        Returns: {
          avatar_url: string
          company_name: string
          full_name: string
          id: string
          member_tier: Database["public"]["Enums"]["member_tier"]
        }[]
      }
      refresh_nps_mentor_options: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "mentor" | "liberty" | "super_admin"
      booking_status:
        | "scheduled"
        | "completed"
        | "rescheduled"
        | "cancelled"
        | "pending_approval"
        | "not_realized"
      member_tier: "begin" | "liberty"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "mentor", "liberty", "super_admin"],
      booking_status: [
        "scheduled",
        "completed",
        "rescheduled",
        "cancelled",
        "pending_approval",
        "not_realized",
      ],
      member_tier: ["begin", "liberty"],
    },
  },
} as const
