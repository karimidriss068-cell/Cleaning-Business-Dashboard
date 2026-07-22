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
      accounts: {
        Row: {
          auto_pause_threshold: number | null
          cpa_alert_threshold: number | null
          created_at: string
          id: string
          name: string
          niche: string | null
          price_per_appointment: number | null
          pricing_model: string | null
          status: Database["public"]["Enums"]["account_status"]
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          auto_pause_threshold?: number | null
          cpa_alert_threshold?: number | null
          created_at?: string
          id?: string
          name: string
          niche?: string | null
          price_per_appointment?: number | null
          pricing_model?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          type: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          auto_pause_threshold?: number | null
          cpa_alert_threshold?: number | null
          created_at?: string
          id?: string
          name?: string
          niche?: string | null
          price_per_appointment?: number | null
          pricing_model?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          type?: Database["public"]["Enums"]["account_type"]
        }
        Relationships: []
      }
      alerts: {
        Row: {
          acknowledged: boolean
          campaign_id: string
          id: string
          message: string
          triggered_at: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Insert: {
          acknowledged?: boolean
          campaign_id: string
          id?: string
          message: string
          triggered_at?: string
          type?: Database["public"]["Enums"]["alert_type"]
        }
        Update: {
          acknowledged?: boolean
          campaign_id?: string
          id?: string
          message?: string
          triggered_at?: string
          type?: Database["public"]["Enums"]["alert_type"]
        }
        Relationships: [
          {
            foreignKeyName: "alerts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          account_id: string
          appointment_date: string | null
          booked_at: string
          closed_recorded_at: string | null
          follow_up_sent_at: string | null
          ghl_appointment_id: string | null
          id: string
          job_closed: boolean | null
          job_revenue: number | null
          lead_id: string
          provider_id: string | null
          revenue_owed: number | null
          status: Database["public"]["Enums"]["appointment_status"]
        }
        Insert: {
          account_id: string
          appointment_date?: string | null
          booked_at?: string
          closed_recorded_at?: string | null
          follow_up_sent_at?: string | null
          ghl_appointment_id?: string | null
          id?: string
          job_closed?: boolean | null
          job_revenue?: number | null
          lead_id: string
          provider_id?: string | null
          revenue_owed?: number | null
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Update: {
          account_id?: string
          appointment_date?: string | null
          booked_at?: string
          closed_recorded_at?: string | null
          follow_up_sent_at?: string | null
          ghl_appointment_id?: string | null
          id?: string
          job_closed?: boolean | null
          job_revenue?: number | null
          lead_id?: string
          provider_id?: string | null
          revenue_owed?: number | null
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appointments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_creatives: {
        Row: {
          campaign_id: string
          creative_id: string
          id: string
        }
        Insert: {
          campaign_id: string
          creative_id: string
          id?: string
        }
        Update: {
          campaign_id?: string
          creative_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_creatives_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          account_id: string
          budget_daily: number | null
          created_at: string
          end_date: string | null
          ghl_campaign_tag: string | null
          id: string
          last_alert_sent_at: string | null
          meta_campaign_id: string | null
          name: string
          objective: string | null
          platform: Database["public"]["Enums"]["campaign_platform"]
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
        }
        Insert: {
          account_id: string
          budget_daily?: number | null
          created_at?: string
          end_date?: string | null
          ghl_campaign_tag?: string | null
          id?: string
          last_alert_sent_at?: string | null
          meta_campaign_id?: string | null
          name: string
          objective?: string | null
          platform?: Database["public"]["Enums"]["campaign_platform"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
        }
        Update: {
          account_id?: string
          budget_daily?: number | null
          created_at?: string
          end_date?: string | null
          ghl_campaign_tag?: string | null
          id?: string
          last_alert_sent_at?: string | null
          meta_campaign_id?: string | null
          name?: string
          objective?: string | null
          platform?: Database["public"]["Enums"]["campaign_platform"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      creatives: {
        Row: {
          account_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["creative_status"]
          type: Database["public"]["Enums"]["creative_type"]
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["creative_status"]
          type?: Database["public"]["Enums"]["creative_type"]
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["creative_status"]
          type?: Database["public"]["Enums"]["creative_type"]
        }
        Relationships: [
          {
            foreignKeyName: "creatives_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_digest: {
        Row: {
          account_id: string
          campaign_id: string | null
          created_at: string
          creative_id: string | null
          digest_date: string
          finding_type: Database["public"]["Enums"]["insights_digest_finding_type"]
          id: string
          message: string
        }
        Insert: {
          account_id: string
          campaign_id?: string | null
          created_at?: string
          creative_id?: string | null
          digest_date?: string
          finding_type: Database["public"]["Enums"]["insights_digest_finding_type"]
          id?: string
          message: string
        }
        Update: {
          account_id?: string
          campaign_id?: string | null
          created_at?: string
          creative_id?: string | null
          digest_date?: string
          finding_type?: Database["public"]["Enums"]["insights_digest_finding_type"]
          id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_digest_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_digest_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_digest_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_digest_dismissals: {
        Row: {
          digest_id: string
          dismissed_at: string
          id: string
          user_id: string
        }
        Insert: {
          digest_id: string
          dismissed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          digest_id?: string
          dismissed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_digest_dismissals_digest_id_fkey"
            columns: ["digest_id"]
            isOneToOne: false
            referencedRelation: "insights_digest"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_messages: {
        Row: {
          caveat: string | null
          content: string
          created_at: string
          data_available: boolean
          follow_ups: Json | null
          id: string
          mentioned_entities: Json | null
          role: Database["public"]["Enums"]["insights_message_role"]
          session_id: string
        }
        Insert: {
          caveat?: string | null
          content: string
          created_at?: string
          data_available?: boolean
          follow_ups?: Json | null
          id?: string
          mentioned_entities?: Json | null
          role: Database["public"]["Enums"]["insights_message_role"]
          session_id: string
        }
        Update: {
          caveat?: string | null
          content?: string
          created_at?: string
          data_available?: boolean
          follow_ups?: Json | null
          id?: string
          mentioned_entities?: Json | null
          role?: Database["public"]["Enums"]["insights_message_role"]
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "insights_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_pins: {
        Row: {
          id: string
          message_id: string
          pinned_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          pinned_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          pinned_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "insights_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_reports: {
        Row: {
          caveat: string | null
          content: string
          created_at: string
          follow_ups: Json | null
          id: string
          mentioned_entities: Json | null
          space_id: string | null
          user_id: string
        }
        Insert: {
          caveat?: string | null
          content: string
          created_at?: string
          follow_ups?: Json | null
          id?: string
          mentioned_entities?: Json | null
          space_id?: string | null
          user_id: string
        }
        Update: {
          caveat?: string | null
          content?: string
          created_at?: string
          follow_ups?: Json | null
          id?: string
          mentioned_entities?: Json | null
          space_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_reports_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "insights_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_sessions: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          space_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          space_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          space_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_sessions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "insights_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_spaces: {
        Row: {
          account_id: string | null
          context_notes: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          context_notes?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          context_notes?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_spaces_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_usage: {
        Row: {
          caller_phone: string | null
          channel: string
          created_at: string
          id: string
          input_tokens: number
          output_tokens: number
          question: string
          user_email: string
          user_id: string
        }
        Insert: {
          caller_phone?: string | null
          channel?: string
          created_at?: string
          id?: string
          input_tokens?: number
          output_tokens?: number
          question: string
          user_email: string
          user_id: string
        }
        Update: {
          caller_phone?: string | null
          channel?: string
          created_at?: string
          id?: string
          input_tokens?: number
          output_tokens?: number
          question?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          campaign_id: string | null
          contact_info: string | null
          created_at: string
          creative_id: string | null
          ghl_contact_id: string | null
          id: string
          name: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
        }
        Insert: {
          campaign_id?: string | null
          contact_info?: string | null
          created_at?: string
          creative_id?: string | null
          ghl_contact_id?: string | null
          id?: string
          name?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
        }
        Update: {
          campaign_id?: string | null
          contact_info?: string | null
          created_at?: string
          creative_id?: string | null
          ghl_contact_id?: string | null
          id?: string
          name?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_contacts: {
        Row: {
          call_booked_at: string | null
          call_held_at: string | null
          channel: Database["public"]["Enums"]["outreach_channel"]
          closed_at: string | null
          contact_info: string | null
          contacted_at: string | null
          created_at: string
          ghl_contact_id: string | null
          id: string
          lead_id: string | null
          name: string | null
          niche: string | null
          replied_at: string | null
          script_id: string | null
          source_batch: string | null
          status: Database["public"]["Enums"]["outreach_contact_status"]
        }
        Insert: {
          call_booked_at?: string | null
          call_held_at?: string | null
          channel?: Database["public"]["Enums"]["outreach_channel"]
          closed_at?: string | null
          contact_info?: string | null
          contacted_at?: string | null
          created_at?: string
          ghl_contact_id?: string | null
          id?: string
          lead_id?: string | null
          name?: string | null
          niche?: string | null
          replied_at?: string | null
          script_id?: string | null
          source_batch?: string | null
          status?: Database["public"]["Enums"]["outreach_contact_status"]
        }
        Update: {
          call_booked_at?: string | null
          call_held_at?: string | null
          channel?: Database["public"]["Enums"]["outreach_channel"]
          closed_at?: string | null
          contact_info?: string | null
          contacted_at?: string | null
          created_at?: string
          ghl_contact_id?: string | null
          id?: string
          lead_id?: string | null
          name?: string | null
          niche?: string | null
          replied_at?: string | null
          script_id?: string | null
          source_batch?: string | null
          status?: Database["public"]["Enums"]["outreach_contact_status"]
        }
        Relationships: [
          {
            foreignKeyName: "outreach_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_contacts_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "outreach_scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_scripts: {
        Row: {
          channel: Database["public"]["Enums"]["outreach_channel"]
          content: string | null
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["outreach_script_status"]
        }
        Insert: {
          channel?: Database["public"]["Enums"]["outreach_channel"]
          content?: string | null
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["outreach_script_status"]
        }
        Update: {
          channel?: Database["public"]["Enums"]["outreach_channel"]
          content?: string | null
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["outreach_script_status"]
        }
        Relationships: []
      }
      packages: {
        Row: {
          account_id: string
          created_at: string
          expiration_date: string | null
          id: string
          package_name: string
          patient_id: string
          price: number | null
          purchase_date: string
          sessions_total: number
          sessions_used: number
        }
        Insert: {
          account_id: string
          created_at?: string
          expiration_date?: string | null
          id?: string
          package_name: string
          patient_id: string
          price?: number | null
          purchase_date?: string
          sessions_total: number
          sessions_used?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          expiration_date?: string | null
          id?: string
          package_name?: string
          patient_id?: string
          price?: number | null
          purchase_date?: string
          sessions_total?: number
          sessions_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "packages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          account_id: string
          created_at: string
          ghl_contact_id: string | null
          id: string
          name: string | null
          phone: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          ghl_contact_id?: string | null
          id?: string
          name?: string | null
          phone?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          ghl_contact_id?: string | null
          id?: string
          name?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          account_id: string
          created_at: string
          id: string
          name: string
          role: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          name: string
          role?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          name?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "providers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      report_shares: {
        Row: {
          account_id: string
          created_at: string
          date_from: string
          date_to: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          account_id: string
          created_at?: string
          date_from: string
          date_to: string
          expires_at: string
          id?: string
          token: string
        }
        Update: {
          account_id?: string
          created_at?: string
          date_from?: string
          date_to?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      spend_daily: {
        Row: {
          campaign_id: string
          clicks: number | null
          created_at: string
          date: string
          id: string
          impressions: number | null
          source: Database["public"]["Enums"]["spend_source"]
          spend: number
        }
        Insert: {
          campaign_id: string
          clicks?: number | null
          created_at?: string
          date: string
          id?: string
          impressions?: number | null
          source?: Database["public"]["Enums"]["spend_source"]
          spend?: number
        }
        Update: {
          campaign_id?: string
          clicks?: number | null
          created_at?: string
          date?: string
          id?: string
          impressions?: number | null
          source?: Database["public"]["Enums"]["spend_source"]
          spend?: number
        }
        Relationships: [
          {
            foreignKeyName: "spend_daily_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          account_id: string
          appointment_id: string | null
          consent_date: string | null
          consent_on_file: boolean
          created_at: string
          id: string
          package_id: string | null
          patient_id: string
          provider_id: string | null
          treatment_date: string | null
          treatment_type: string
        }
        Insert: {
          account_id: string
          appointment_id?: string | null
          consent_date?: string | null
          consent_on_file?: boolean
          created_at?: string
          id?: string
          package_id?: string | null
          patient_id: string
          provider_id?: string | null
          treatment_date?: string | null
          treatment_type: string
        }
        Update: {
          account_id?: string
          appointment_id?: string | null
          consent_date?: string | null
          consent_on_file?: boolean
          created_at?: string
          id?: string
          package_id?: string | null
          patient_id?: string
          provider_id?: string | null
          treatment_date?: string | null
          treatment_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      account_status: "active" | "paused" | "churned"
      account_type: "internal" | "client"
      alert_type: "cpa_warning" | "cpa_critical" | "zero_leads" | "other"
      appointment_status:
        | "booked"
        | "showed"
        | "no_show"
        | "cancelled"
        | "closed"
      campaign_platform: "meta" | "google" | "other"
      campaign_status: "draft" | "active" | "paused" | "ended"
      creative_status: "testing" | "winning" | "retired"
      creative_type: "video" | "image" | "script" | "vsl"
      insights_digest_finding_type:
        | "zero_leads"
        | "cpa_above_threshold"
        | "creative_cpa_spike"
        | "ghost_leads"
        | "slow_response"
        | "package_expiring"
        | "rebooking_due"
        | "upsell_opportunity"
        | "consent_missing"
      insights_message_role: "user" | "assistant"
      lead_status: "new" | "contacted" | "qualified" | "booked" | "dead"
      outreach_channel: "sms" | "cold_call" | "dm" | "email"
      outreach_contact_status:
        | "contacted"
        | "replied"
        | "call_booked"
        | "call_held"
        | "closed"
        | "dead"
      outreach_script_status: "testing" | "winning" | "retired"
      spend_source: "manual" | "meta_api" | "google_api"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      account_status: ["active", "paused", "churned"],
      account_type: ["internal", "client"],
      alert_type: ["cpa_warning", "cpa_critical", "zero_leads", "other"],
      appointment_status: [
        "booked",
        "showed",
        "no_show",
        "cancelled",
        "closed",
      ],
      campaign_platform: ["meta", "google", "other"],
      campaign_status: ["draft", "active", "paused", "ended"],
      creative_status: ["testing", "winning", "retired"],
      creative_type: ["video", "image", "script", "vsl"],
      insights_digest_finding_type: [
        "zero_leads",
        "cpa_above_threshold",
        "creative_cpa_spike",
        "ghost_leads",
        "slow_response",
        "package_expiring",
        "rebooking_due",
        "upsell_opportunity",
        "consent_missing",
      ],
      insights_message_role: ["user", "assistant"],
      lead_status: ["new", "contacted", "qualified", "booked", "dead"],
      outreach_channel: ["sms", "cold_call", "dm", "email"],
      outreach_contact_status: [
        "contacted",
        "replied",
        "call_booked",
        "call_held",
        "closed",
        "dead",
      ],
      outreach_script_status: ["testing", "winning", "retired"],
      spend_source: ["manual", "meta_api", "google_api"],
    },
  },
} as const
