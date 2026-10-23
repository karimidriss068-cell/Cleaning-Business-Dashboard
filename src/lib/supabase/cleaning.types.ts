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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string
          id: string
          industry: string | null
          monthly_value_cents: number | null
          name: string
          notes: string | null
          payment_terms: Database["public"]["Enums"]["payment_terms"]
          primary_contact_id: string | null
          renewal_date: string | null
          status: Database["public"]["Enums"]["account_status"]
          stripe_customer_id: string | null
          updated_at: string
          visits_per_month: number | null
          walkthrough_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          industry?: string | null
          monthly_value_cents?: number | null
          name: string
          notes?: string | null
          payment_terms?: Database["public"]["Enums"]["payment_terms"]
          primary_contact_id?: string | null
          renewal_date?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          stripe_customer_id?: string | null
          updated_at?: string
          visits_per_month?: number | null
          walkthrough_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          industry?: string | null
          monthly_value_cents?: number | null
          name?: string
          notes?: string | null
          payment_terms?: Database["public"]["Enums"]["payment_terms"]
          primary_contact_id?: string | null
          renewal_date?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          stripe_customer_id?: string | null
          updated_at?: string
          visits_per_month?: number | null
          walkthrough_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          account_id: string | null
          actor_user_id: string | null
          body: string | null
          contact_id: string | null
          created_at: string
          direction: Database["public"]["Enums"]["activity_direction"] | null
          external_id: string | null
          id: string
          job_id: string | null
          lead_id: string | null
          occurred_at: string
          subject: string | null
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          actor_user_id?: string | null
          body?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["activity_direction"] | null
          external_id?: string | null
          id?: string
          job_id?: string | null
          lead_id?: string | null
          occurred_at?: string
          subject?: string | null
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          actor_user_id?: string | null
          body?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["activity_direction"] | null
          external_id?: string | null
          id?: string
          job_id?: string | null
          lead_id?: string | null
          occurred_at?: string
          subject?: string | null
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string | null
          address_line1: string | null
          address_line2: string | null
          borough: Database["public"]["Enums"]["borough"] | null
          city: string | null
          created_at: string
          email: string | null
          first_name: string
          ghl_contact_id: string | null
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          source: string | null
          state: string
          stripe_customer_id: string | null
          type: Database["public"]["Enums"]["contact_type"]
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          zip: string | null
        }
        Insert: {
          account_id?: string | null
          address_line1?: string | null
          address_line2?: string | null
          borough?: Database["public"]["Enums"]["borough"] | null
          city?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          ghl_contact_id?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          state?: string
          stripe_customer_id?: string | null
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          zip?: string | null
        }
        Update: {
          account_id?: string | null
          address_line1?: string | null
          address_line2?: string | null
          borough?: Database["public"]["Enums"]["borough"] | null
          city?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          ghl_contact_id?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          state?: string
          stripe_customer_id?: string | null
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members: {
        Row: {
          created_at: string
          crew_id: string
          id: string
          subcontractor_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          id?: string
          subcontractor_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          id?: string
          subcontractor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          lead_subcontractor_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          lead_subcontractor_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          lead_subcontractor_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crews_lead_subcontractor_id_fkey"
            columns: ["lead_subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          description: string
          id: string
          incurred_on: string
          job_id: string | null
          receipt_path: string | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          amount_cents: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          incurred_on: string
          job_id?: string | null
          receipt_path?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          amount_cents?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          incurred_on?: string
          job_id?: string | null
          receipt_path?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expenses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          job_id: string | null
          line_total_cents: number | null
          quantity: number
          sort_order: number
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          job_id?: string | null
          line_total_cents?: number | null
          quantity?: number
          sort_order?: number
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          job_id?: string | null
          line_total_cents?: number | null
          quantity?: number
          sort_order?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          account_id: string | null
          amount_paid_cents: number
          contact_id: string | null
          created_at: string
          due_on: string | null
          id: string
          invoice_number: number
          issued_on: string | null
          notes: string | null
          paid_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_hosted_invoice_url: string | null
          stripe_invoice_id: string | null
          subtotal_cents: number
          tax_cents: number
          total_cents: number | null
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          account_id?: string | null
          amount_paid_cents?: number
          contact_id?: string | null
          created_at?: string
          due_on?: string | null
          id?: string
          invoice_number?: never
          issued_on?: string | null
          notes?: string | null
          paid_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_hosted_invoice_url?: string | null
          stripe_invoice_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number | null
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          account_id?: string | null
          amount_paid_cents?: number
          contact_id?: string | null
          created_at?: string
          due_on?: string | null
          id?: string
          invoice_number?: never
          issued_on?: string | null
          notes?: string | null
          paid_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_hosted_invoice_url?: string | null
          stripe_invoice_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number | null
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      job_assignments: {
        Row: {
          computed_pay_cents: number | null
          created_at: string
          id: string
          job_id: string
          minutes_worked: number | null
          pay_cents: number | null
          pay_override_cents: number | null
          pay_rate_bps: number | null
          pay_rate_cents: number | null
          pay_type: Database["public"]["Enums"]["pay_type"]
          subcontractor_id: string
          updated_at: string
        }
        Insert: {
          computed_pay_cents?: number | null
          created_at?: string
          id?: string
          job_id: string
          minutes_worked?: number | null
          pay_cents?: number | null
          pay_override_cents?: number | null
          pay_rate_bps?: number | null
          pay_rate_cents?: number | null
          pay_type: Database["public"]["Enums"]["pay_type"]
          subcontractor_id: string
          updated_at?: string
        }
        Update: {
          computed_pay_cents?: number | null
          created_at?: string
          id?: string
          job_id?: string
          minutes_worked?: number | null
          pay_cents?: number | null
          pay_override_cents?: number | null
          pay_rate_bps?: number | null
          pay_rate_cents?: number | null
          pay_type?: Database["public"]["Enums"]["pay_type"]
          subcontractor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          created_at: string
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["job_photo_kind"]
          storage_path: string
          taken_at: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          kind?: Database["public"]["Enums"]["job_photo_kind"]
          storage_path: string
          taken_at?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          kind?: Database["public"]["Enums"]["job_photo_kind"]
          storage_path?: string
          taken_at?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      job_series: {
        Row: {
          account_id: string | null
          contact_id: string | null
          created_at: string
          default_crew_id: string | null
          duration_minutes: number
          end_date: string | null
          generated_through: string | null
          id: string
          is_active: boolean
          local_start_time: string
          notes: string | null
          price_cents: number
          property_id: string
          recurrence_rule: string
          service_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          default_crew_id?: string | null
          duration_minutes: number
          end_date?: string | null
          generated_through?: string | null
          id?: string
          is_active?: boolean
          local_start_time: string
          notes?: string | null
          price_cents: number
          property_id: string
          recurrence_rule: string
          service_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          default_crew_id?: string | null
          duration_minutes?: number
          end_date?: string | null
          generated_through?: string | null
          id?: string
          is_active?: boolean
          local_start_time?: string
          notes?: string | null
          price_cents?: number
          property_id?: string
          recurrence_rule?: string
          service_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_series_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_series_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_series_default_crew_id_fkey"
            columns: ["default_crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_series_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_series_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          account_id: string | null
          cancellation_reason: string | null
          completed_at: string | null
          completed_by: string | null
          contact_id: string | null
          created_at: string
          crew_id: string | null
          crew_notes: string | null
          external_id: string | null
          ghl_appointment_id: string | null
          id: string
          notes: string | null
          price_cents: number
          property_id: string
          quote_id: string | null
          scheduled_end: string
          scheduled_start: string
          series_id: string | null
          service_id: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          crew_id?: string | null
          crew_notes?: string | null
          external_id?: string | null
          ghl_appointment_id?: string | null
          id?: string
          notes?: string | null
          price_cents: number
          property_id: string
          quote_id?: string | null
          scheduled_end: string
          scheduled_start: string
          series_id?: string | null
          service_id: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          crew_id?: string | null
          crew_notes?: string | null
          external_id?: string | null
          ghl_appointment_id?: string | null
          id?: string
          notes?: string | null
          price_cents?: number
          property_id?: string
          quote_id?: string | null
          scheduled_end?: string
          scheduled_start?: string
          series_id?: string | null
          service_id?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "jobs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "job_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          bathrooms: number | null
          bedrooms: number | null
          campaign_id: string | null
          contact_id: string
          created_at: string
          first_response_at: string | null
          ghl_opportunity_id: string | null
          id: string
          lost_reason: string | null
          notes: string | null
          requested_date: string | null
          service_id: string | null
          source: string | null
          sqft: number | null
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
        }
        Insert: {
          bathrooms?: number | null
          bedrooms?: number | null
          campaign_id?: string | null
          contact_id: string
          created_at?: string
          first_response_at?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          requested_date?: string | null
          service_id?: string | null
          source?: string | null
          sqft?: number | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Update: {
          bathrooms?: number | null
          bedrooms?: number | null
          campaign_id?: string | null
          contact_id?: string
          created_at?: string
          first_response_at?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          requested_date?: string | null
          service_id?: string | null
          source?: string | null
          sqft?: number | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          budget_cents: number | null
          created_at: string
          end_date: string | null
          external_id: string | null
          id: string
          name: string
          platform: Database["public"]["Enums"]["marketing_platform"]
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          budget_cents?: number | null
          created_at?: string
          end_date?: string | null
          external_id?: string | null
          id?: string
          name: string
          platform: Database["public"]["Enums"]["marketing_platform"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          budget_cents?: number | null
          created_at?: string
          end_date?: string | null
          external_id?: string | null
          id?: string
          name?: string
          platform?: Database["public"]["Enums"]["marketing_platform"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: []
      }
      marketing_daily_stats: {
        Row: {
          campaign_id: string
          clicks: number
          created_at: string
          date: string
          id: string
          impressions: number
          leads: number
          spend_cents: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          clicks?: number
          created_at?: string
          date: string
          id?: string
          impressions?: number
          leads?: number
          spend_cents?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          clicks?: number
          created_at?: string
          date?: string
          id?: string
          impressions?: number
          leads?: number
          spend_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_daily_stats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          received_at: string | null
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          received_at?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          received_at?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_items: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          job_assignment_id: string
          payout_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          job_assignment_id: string
          payout_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          job_assignment_id?: string
          payout_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_items_job_assignment_id_fkey"
            columns: ["job_assignment_id"]
            isOneToOne: true
            referencedRelation: "job_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          payout_vendor_ref: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["payout_status"]
          subcontractor_id: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payout_vendor_ref?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["payout_status"]
          subcontractor_id: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payout_vendor_ref?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["payout_status"]
          subcontractor_id?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payouts_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          subcontractor_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          is_active?: boolean
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          subcontractor_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          subcontractor_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: true
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          access_instructions: string | null
          account_id: string | null
          address_line1: string
          address_line2: string | null
          bathrooms: number | null
          bedrooms: number | null
          borough: Database["public"]["Enums"]["borough"]
          city: string | null
          contact_id: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          sqft: number | null
          state: string
          updated_at: string
          zip: string
        }
        Insert: {
          access_instructions?: string | null
          account_id?: string | null
          address_line1: string
          address_line2?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          borough: Database["public"]["Enums"]["borough"]
          city?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          sqft?: number | null
          state?: string
          updated_at?: string
          zip: string
        }
        Update: {
          access_instructions?: string | null
          account_id?: string | null
          address_line1?: string
          address_line2?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          borough?: Database["public"]["Enums"]["borough"]
          city?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          sqft?: number | null
          state?: string
          updated_at?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          line_total_cents: number | null
          quantity: number
          quote_id: string
          service_id: string | null
          sort_order: number
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          line_total_cents?: number | null
          quantity?: number
          quote_id: string
          service_id?: string | null
          sort_order?: number
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          line_total_cents?: number | null
          quantity?: number
          quote_id?: string
          service_id?: string | null
          sort_order?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          account_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          declined_at: string | null
          discount_cents: number
          id: string
          lead_id: string | null
          notes: string | null
          property_id: string | null
          quote_number: number
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_cents: number
          tax_cents: number
          total_cents: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          discount_cents?: number
          id?: string
          lead_id?: string | null
          notes?: string | null
          property_id?: string | null
          quote_number?: never
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          discount_cents?: number
          id?: string
          lead_id?: string | null
          notes?: string | null
          property_id?: string | null
          quote_number?: never
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          base_price_cents: number
          created_at: string
          default_duration_minutes: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          pricing_model: Database["public"]["Enums"]["pricing_model"]
          updated_at: string
        }
        Insert: {
          base_price_cents: number
          created_at?: string
          default_duration_minutes: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          updated_at?: string
        }
        Update: {
          base_price_cents?: number
          created_at?: string
          default_duration_minutes?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          updated_at?: string
        }
        Relationships: []
      }
      subcontractor_documents: {
        Row: {
          created_at: string
          expires_on: string | null
          id: string
          storage_path: string
          subcontractor_id: string
          type: Database["public"]["Enums"]["subcontractor_document_type"]
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          expires_on?: string | null
          id?: string
          storage_path: string
          subcontractor_id: string
          type: Database["public"]["Enums"]["subcontractor_document_type"]
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          expires_on?: string | null
          id?: string
          storage_path?: string
          subcontractor_id?: string
          type?: Database["public"]["Enums"]["subcontractor_document_type"]
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_documents_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      subcontractors: {
        Row: {
          boroughs_served: Database["public"]["Enums"]["borough"][]
          business_entity: Database["public"]["Enums"]["business_entity"]
          coi_expires_on: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          legal_name: string | null
          notes: string | null
          pay_rate_bps: number | null
          pay_rate_cents: number | null
          pay_type: Database["public"]["Enums"]["pay_type"]
          payout_vendor_ref: string | null
          phone: string | null
          status: Database["public"]["Enums"]["subcontractor_status"]
          updated_at: string
          w9_received_at: string | null
        }
        Insert: {
          boroughs_served?: Database["public"]["Enums"]["borough"][]
          business_entity?: Database["public"]["Enums"]["business_entity"]
          coi_expires_on?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          legal_name?: string | null
          notes?: string | null
          pay_rate_bps?: number | null
          pay_rate_cents?: number | null
          pay_type?: Database["public"]["Enums"]["pay_type"]
          payout_vendor_ref?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["subcontractor_status"]
          updated_at?: string
          w9_received_at?: string | null
        }
        Update: {
          boroughs_served?: Database["public"]["Enums"]["borough"][]
          business_entity?: Database["public"]["Enums"]["business_entity"]
          coi_expires_on?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          notes?: string | null
          pay_rate_bps?: number | null
          pay_rate_cents?: number | null
          pay_type?: Database["public"]["Enums"]["pay_type"]
          payout_vendor_ref?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["subcontractor_status"]
          updated_at?: string
          w9_received_at?: string | null
        }
        Relationships: []
      }
      vendors: {
        Row: {
          category: Database["public"]["Enums"]["expense_category"] | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["expense_category"] | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["expense_category"] | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          error: string | null
          event_id: string
          id: string
          payload_hash: string
          processed_at: string | null
          provider: string
          received_at: string
          status: string
        }
        Insert: {
          error?: string | null
          event_id: string
          id?: string
          payload_hash: string
          processed_at?: string | null
          provider: string
          received_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          event_id?: string
          id?: string
          payload_hash?: string
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_job: { Args: { p_job_id: string }; Returns: undefined }
      my_jobs: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          access_instructions: string
          address_line1: string
          address_line2: string
          borough: Database["public"]["Enums"]["borough"]
          client_name: string
          crew_notes: string
          job_id: string
          photo_count: number
          scheduled_end: string
          scheduled_start: string
          service_name: string
          status: Database["public"]["Enums"]["job_status"]
          zip: string
        }[]
      }
    }
    Enums: {
      account_status: "prospect" | "active" | "paused" | "churned"
      activity_direction: "inbound" | "outbound"
      activity_type:
        | "call"
        | "sms"
        | "email"
        | "note"
        | "meeting"
        | "status_change"
      app_role: "owner" | "admin" | "staff" | "subcontractor"
      borough: "manhattan" | "brooklyn" | "queens" | "bronx" | "staten_island"
      business_entity: "individual" | "llc" | "corporation"
      campaign_status: "draft" | "active" | "paused" | "ended"
      contact_type: "residential" | "commercial"
      expense_category:
        | "supplies"
        | "equipment"
        | "transit"
        | "marketing"
        | "software"
        | "insurance"
        | "other"
      invoice_status: "draft" | "open" | "paid" | "void" | "uncollectible"
      job_photo_kind: "before" | "after" | "issue"
      job_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_access"
      lead_stage: "new" | "contacted" | "quoted" | "won" | "lost"
      marketing_platform:
        | "meta"
        | "google"
        | "tiktok"
        | "nextdoor"
        | "yelp"
        | "thumbtack"
        | "other"
      pay_type: "flat" | "percent" | "hourly"
      payment_method: "card" | "ach" | "check" | "cash" | "zelle" | "other"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
      payment_terms: "due_on_receipt" | "net_15" | "net_30" | "net_45"
      payout_status: "draft" | "approved" | "paid" | "void"
      pricing_model: "flat" | "hourly" | "per_sqft"
      quote_status: "draft" | "sent" | "accepted" | "declined" | "expired"
      subcontractor_document_type: "w9" | "coi" | "agreement" | "other"
      subcontractor_status: "onboarding" | "active" | "inactive"
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
      account_status: ["prospect", "active", "paused", "churned"],
      activity_direction: ["inbound", "outbound"],
      activity_type: [
        "call",
        "sms",
        "email",
        "note",
        "meeting",
        "status_change",
      ],
      app_role: ["owner", "admin", "staff", "subcontractor"],
      borough: ["manhattan", "brooklyn", "queens", "bronx", "staten_island"],
      business_entity: ["individual", "llc", "corporation"],
      campaign_status: ["draft", "active", "paused", "ended"],
      contact_type: ["residential", "commercial"],
      expense_category: [
        "supplies",
        "equipment",
        "transit",
        "marketing",
        "software",
        "insurance",
        "other",
      ],
      invoice_status: ["draft", "open", "paid", "void", "uncollectible"],
      job_photo_kind: ["before", "after", "issue"],
      job_status: [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "no_access",
      ],
      lead_stage: ["new", "contacted", "quoted", "won", "lost"],
      marketing_platform: [
        "meta",
        "google",
        "tiktok",
        "nextdoor",
        "yelp",
        "thumbtack",
        "other",
      ],
      pay_type: ["flat", "percent", "hourly"],
      payment_method: ["card", "ach", "check", "cash", "zelle", "other"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      payment_terms: ["due_on_receipt", "net_15", "net_30", "net_45"],
      payout_status: ["draft", "approved", "paid", "void"],
      pricing_model: ["flat", "hourly", "per_sqft"],
      quote_status: ["draft", "sent", "accepted", "declined", "expired"],
      subcontractor_document_type: ["w9", "coi", "agreement", "other"],
      subcontractor_status: ["onboarding", "active", "inactive"],
    },
  },
} as const
