export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          auto_pause_threshold: number | null;
          cpa_alert_threshold: number | null;
          created_at: string;
          id: string;
          name: string;
          niche: string | null;
          price_per_appointment: number | null;
          pricing_model: string | null;
          status: Database["public"]["Enums"]["account_status"];
          type: Database["public"]["Enums"]["account_type"];
        };
        Insert: {
          auto_pause_threshold?: number | null;
          cpa_alert_threshold?: number | null;
          created_at?: string;
          id?: string;
          name: string;
          niche?: string | null;
          price_per_appointment?: number | null;
          pricing_model?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          type: Database["public"]["Enums"]["account_type"];
        };
        Update: {
          auto_pause_threshold?: number | null;
          cpa_alert_threshold?: number | null;
          created_at?: string;
          id?: string;
          name?: string;
          niche?: string | null;
          price_per_appointment?: number | null;
          pricing_model?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          type?: Database["public"]["Enums"]["account_type"];
        };
        Relationships: [];
      };
      alerts: {
        Row: {
          acknowledged: boolean;
          campaign_id: string;
          id: string;
          message: string;
          triggered_at: string;
          type: Database["public"]["Enums"]["alert_type"];
        };
        Insert: {
          acknowledged?: boolean;
          campaign_id: string;
          id?: string;
          message: string;
          triggered_at?: string;
          type?: Database["public"]["Enums"]["alert_type"];
        };
        Update: {
          acknowledged?: boolean;
          campaign_id?: string;
          id?: string;
          message?: string;
          triggered_at?: string;
          type?: Database["public"]["Enums"]["alert_type"];
        };
        Relationships: [
          {
            foreignKeyName: "alerts_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          account_id: string;
          appointment_date: string | null;
          booked_at: string;
          ghl_appointment_id: string | null;
          id: string;
          lead_id: string;
          revenue_owed: number | null;
          status: Database["public"]["Enums"]["appointment_status"];
        };
        Insert: {
          account_id: string;
          appointment_date?: string | null;
          booked_at?: string;
          ghl_appointment_id?: string | null;
          id?: string;
          lead_id: string;
          revenue_owed?: number | null;
          status?: Database["public"]["Enums"]["appointment_status"];
        };
        Update: {
          account_id?: string;
          appointment_date?: string | null;
          booked_at?: string;
          ghl_appointment_id?: string | null;
          id?: string;
          lead_id?: string;
          revenue_owed?: number | null;
          status?: Database["public"]["Enums"]["appointment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "appointments_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_creatives: {
        Row: {
          campaign_id: string;
          creative_id: string;
          id: string;
        };
        Insert: {
          campaign_id: string;
          creative_id: string;
          id?: string;
        };
        Update: {
          campaign_id?: string;
          creative_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_creatives_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_creatives_creative_id_fkey";
            columns: ["creative_id"];
            isOneToOne: false;
            referencedRelation: "creatives";
            referencedColumns: ["id"];
          },
        ];
      };
      campaigns: {
        Row: {
          account_id: string;
          budget_daily: number | null;
          created_at: string;
          end_date: string | null;
          ghl_campaign_tag: string | null;
          id: string;
          last_alert_sent_at: string | null;
          name: string;
          objective: string | null;
          platform: Database["public"]["Enums"]["campaign_platform"];
          start_date: string | null;
          status: Database["public"]["Enums"]["campaign_status"];
        };
        Insert: {
          account_id: string;
          budget_daily?: number | null;
          created_at?: string;
          end_date?: string | null;
          ghl_campaign_tag?: string | null;
          id?: string;
          last_alert_sent_at?: string | null;
          name: string;
          objective?: string | null;
          platform?: Database["public"]["Enums"]["campaign_platform"];
          start_date?: string | null;
          status?: Database["public"]["Enums"]["campaign_status"];
        };
        Update: {
          account_id?: string;
          budget_daily?: number | null;
          created_at?: string;
          end_date?: string | null;
          ghl_campaign_tag?: string | null;
          id?: string;
          last_alert_sent_at?: string | null;
          name?: string;
          objective?: string | null;
          platform?: Database["public"]["Enums"]["campaign_platform"];
          start_date?: string | null;
          status?: Database["public"]["Enums"]["campaign_status"];
        };
        Relationships: [
          {
            foreignKeyName: "campaigns_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      creatives: {
        Row: {
          account_id: string;
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          status: Database["public"]["Enums"]["creative_status"];
          type: Database["public"]["Enums"]["creative_type"];
        };
        Insert: {
          account_id: string;
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["creative_status"];
          type?: Database["public"]["Enums"]["creative_type"];
        };
        Update: {
          account_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["creative_status"];
          type?: Database["public"]["Enums"]["creative_type"];
        };
        Relationships: [
          {
            foreignKeyName: "creatives_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          campaign_id: string | null;
          contact_info: string | null;
          created_at: string;
          creative_id: string | null;
          ghl_contact_id: string | null;
          id: string;
          name: string | null;
          source: string | null;
          status: Database["public"]["Enums"]["lead_status"];
        };
        Insert: {
          campaign_id?: string | null;
          contact_info?: string | null;
          created_at?: string;
          creative_id?: string | null;
          ghl_contact_id?: string | null;
          id?: string;
          name?: string | null;
          source?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
        };
        Update: {
          campaign_id?: string | null;
          contact_info?: string | null;
          created_at?: string;
          creative_id?: string | null;
          ghl_contact_id?: string | null;
          id?: string;
          name?: string | null;
          source?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
        };
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_creative_id_fkey";
            columns: ["creative_id"];
            isOneToOne: false;
            referencedRelation: "creatives";
            referencedColumns: ["id"];
          },
        ];
      };
      outreach_contacts: {
        Row: {
          call_booked_at: string | null;
          call_held_at: string | null;
          channel: Database["public"]["Enums"]["outreach_channel"];
          closed_at: string | null;
          contact_info: string | null;
          contacted_at: string | null;
          created_at: string;
          ghl_contact_id: string | null;
          id: string;
          lead_id: string | null;
          name: string | null;
          niche: string | null;
          replied_at: string | null;
          script_id: string | null;
          source_batch: string | null;
          status: Database["public"]["Enums"]["outreach_contact_status"];
        };
        Insert: {
          call_booked_at?: string | null;
          call_held_at?: string | null;
          channel?: Database["public"]["Enums"]["outreach_channel"];
          closed_at?: string | null;
          contact_info?: string | null;
          contacted_at?: string | null;
          created_at?: string;
          ghl_contact_id?: string | null;
          id?: string;
          lead_id?: string | null;
          name?: string | null;
          niche?: string | null;
          replied_at?: string | null;
          script_id?: string | null;
          source_batch?: string | null;
          status?: Database["public"]["Enums"]["outreach_contact_status"];
        };
        Update: {
          call_booked_at?: string | null;
          call_held_at?: string | null;
          channel?: Database["public"]["Enums"]["outreach_channel"];
          closed_at?: string | null;
          contact_info?: string | null;
          contacted_at?: string | null;
          created_at?: string;
          ghl_contact_id?: string | null;
          id?: string;
          lead_id?: string | null;
          name?: string | null;
          niche?: string | null;
          replied_at?: string | null;
          script_id?: string | null;
          source_batch?: string | null;
          status?: Database["public"]["Enums"]["outreach_contact_status"];
        };
        Relationships: [
          {
            foreignKeyName: "outreach_contacts_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outreach_contacts_script_id_fkey";
            columns: ["script_id"];
            isOneToOne: false;
            referencedRelation: "outreach_scripts";
            referencedColumns: ["id"];
          },
        ];
      };
      outreach_scripts: {
        Row: {
          channel: Database["public"]["Enums"]["outreach_channel"];
          content: string | null;
          created_at: string;
          id: string;
          name: string;
          status: Database["public"]["Enums"]["outreach_script_status"];
        };
        Insert: {
          channel?: Database["public"]["Enums"]["outreach_channel"];
          content?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          status?: Database["public"]["Enums"]["outreach_script_status"];
        };
        Update: {
          channel?: Database["public"]["Enums"]["outreach_channel"];
          content?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          status?: Database["public"]["Enums"]["outreach_script_status"];
        };
        Relationships: [];
      };
      report_shares: {
        Row: {
          account_id: string;
          created_at: string;
          date_from: string;
          date_to: string;
          expires_at: string;
          id: string;
          token: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          date_from: string;
          date_to: string;
          expires_at: string;
          id?: string;
          token: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          date_from?: string;
          date_to?: string;
          expires_at?: string;
          id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_shares_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      spend_daily: {
        Row: {
          campaign_id: string;
          clicks: number | null;
          created_at: string;
          date: string;
          id: string;
          impressions: number | null;
          source: Database["public"]["Enums"]["spend_source"];
          spend: number;
        };
        Insert: {
          campaign_id: string;
          clicks?: number | null;
          created_at?: string;
          date: string;
          id?: string;
          impressions?: number | null;
          source?: Database["public"]["Enums"]["spend_source"];
          spend?: number;
        };
        Update: {
          campaign_id?: string;
          clicks?: number | null;
          created_at?: string;
          date?: string;
          id?: string;
          impressions?: number | null;
          source?: Database["public"]["Enums"]["spend_source"];
          spend?: number;
        };
        Relationships: [
          {
            foreignKeyName: "spend_daily_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "campaigns";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      account_status: "active" | "paused" | "churned";
      account_type: "internal" | "client";
      alert_type: "cpa_warning" | "cpa_critical" | "zero_leads" | "other";
      appointment_status: "booked" | "showed" | "no_show" | "cancelled" | "closed";
      campaign_platform: "meta" | "google" | "other";
      campaign_status: "draft" | "active" | "paused" | "ended";
      creative_status: "testing" | "winning" | "retired";
      creative_type: "video" | "image" | "script" | "vsl";
      lead_status: "new" | "contacted" | "qualified" | "booked" | "dead";
      outreach_channel: "sms" | "cold_call" | "dm" | "email";
      outreach_contact_status:
        | "contacted"
        | "replied"
        | "call_booked"
        | "call_held"
        | "closed"
        | "dead";
      outreach_script_status: "testing" | "winning" | "retired";
      spend_source: "manual" | "meta_api" | "google_api";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
