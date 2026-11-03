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
      app_settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor: string | null
          at: string
          id: string
          new: Json | null
          old: Json | null
          row_id: string
          table_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor?: string | null
          at?: string
          id?: string
          new?: Json | null
          old?: Json | null
          row_id: string
          table_name: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor?: string | null
          at?: string
          id?: string
          new?: Json | null
          old?: Json | null
          row_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      category_thresholds: {
        Row: {
          category_id: string
          low_stock_min: number
          store_id: string
        }
        Insert: {
          category_id: string
          low_stock_min?: number
          store_id: string
        }
        Update: {
          category_id?: string
          low_stock_min?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_thresholds_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_thresholds_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_locations: {
        Row: {
          created_at: string
          id: string
          is_archived: boolean
          is_general: boolean
          label_en: string
          label_fr: string
          sort: number
          store_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_general?: boolean
          label_en: string
          label_fr: string
          sort?: number
          store_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_general?: boolean
          label_en?: string
          label_fr?: string
          sort?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charge_locations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category_id: string
          charge_date: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          location_id: string
          order_id: string | null
          reason: string
          recurring_charge_id: string | null
          status: Database["public"]["Enums"]["charge_status"]
          supplier_payment_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          category_id: string
          charge_date?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          location_id: string
          order_id?: string | null
          reason: string
          recurring_charge_id?: string | null
          status?: Database["public"]["Enums"]["charge_status"]
          supplier_payment_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category_id?: string
          charge_date?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          location_id?: string
          order_id?: string | null
          reason?: string
          recurring_charge_id?: string | null
          status?: Database["public"]["Enums"]["charge_status"]
          supplier_payment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charges_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "settings_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "charge_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_balances"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "charges_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_numbers"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "charges_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_recurring_charge_id_fkey"
            columns: ["recurring_charge_id"]
            isOneToOne: false
            referencedRelation: "recurring_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_supplier_payment_id_fkey"
            columns: ["supplier_payment_id"]
            isOneToOne: true
            referencedRelation: "supplier_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          created_by: string | null
          first_store_id: string | null
          full_name: string
          has_whatsapp: boolean
          id: string
          is_loyal: boolean
          loyal_since: string | null
          notes: string | null
          pending_discount_note: string | null
          pending_discount_set_by: string | null
          pending_discount_type:
            | Database["public"]["Enums"]["discount_type"]
            | null
          pending_discount_value: number | null
          phone_e164: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          first_store_id?: string | null
          full_name: string
          has_whatsapp?: boolean
          id?: string
          is_loyal?: boolean
          loyal_since?: string | null
          notes?: string | null
          pending_discount_note?: string | null
          pending_discount_set_by?: string | null
          pending_discount_type?:
            | Database["public"]["Enums"]["discount_type"]
            | null
          pending_discount_value?: number | null
          phone_e164: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          first_store_id?: string | null
          full_name?: string
          has_whatsapp?: boolean
          id?: string
          is_loyal?: boolean
          loyal_since?: string | null
          notes?: string | null
          pending_discount_note?: string | null
          pending_discount_set_by?: string | null
          pending_discount_type?:
            | Database["public"]["Enums"]["discount_type"]
            | null
          pending_discount_value?: number | null
          phone_e164?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_first_store_id_fkey"
            columns: ["first_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_pending_discount_set_by_fkey"
            columns: ["pending_discount_set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          applies_to: string
          created_at: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id: string
          is_builtin: boolean
          key: string
          label_en: string
          label_fr: string
          options: Json
          sort: number
          visibility: Database["public"]["Enums"]["field_visibility"]
        }
        Insert: {
          applies_to?: string
          created_at?: string
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          is_builtin?: boolean
          key: string
          label_en: string
          label_fr: string
          options?: Json
          sort?: number
          visibility?: Database["public"]["Enums"]["field_visibility"]
        }
        Update: {
          applies_to?: string
          created_at?: string
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          is_builtin?: boolean
          key?: string
          label_en?: string
          label_fr?: string
          options?: Json
          sort?: number
          visibility?: Database["public"]["Enums"]["field_visibility"]
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          link: string | null
          params: Json
          read_at: string | null
          title_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          link?: string | null
          params?: Json
          read_at?: string | null
          title_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          link?: string | null
          params?: Json
          read_at?: string | null
          title_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          category_id: string
          created_at: string
          id: string
          order_id: string
          qty: number
          unit_price: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          order_id: string
          qty: number
          unit_price: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          order_id?: string
          qty?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_balances"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_numbers"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_balances"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_numbers"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_treatments: {
        Row: {
          order_id: string
          treatment_id: string
        }
        Insert: {
          order_id: string
          treatment_id: string
        }
        Update: {
          order_id?: string
          treatment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_treatments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_balances"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_treatments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_numbers"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_treatments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_treatments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "settings_list_items"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          booklet: string
          cancel_note: string | null
          cancel_reason_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          client_own_frame: boolean
          created_at: string
          created_by: string | null
          custom_values: Json
          delivered_at: string | null
          discount_amount: number
          discount_source: Database["public"]["Enums"]["discount_source"]
          doctor_name: string | null
          ep_le: number | null
          ep_re: number | null
          fitting_height: number | null
          frame_revenue: number
          id: string
          le_add: number | null
          le_axis: number | null
          le_cyl: number | null
          le_sph: number | null
          lens_details: string | null
          lens_revenue: number | null
          lens_type_id: string | null
          prescription_date: string | null
          prescription_photo_path: string | null
          re_add: number | null
          re_axis: number | null
          re_cyl: number | null
          re_sph: number | null
          slip_number: number
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          total: number | null
          vision_type_id: string | null
        }
        Insert: {
          booklet?: string
          cancel_note?: string | null
          cancel_reason_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id: string
          client_own_frame?: boolean
          created_at?: string
          created_by?: string | null
          custom_values?: Json
          delivered_at?: string | null
          discount_amount?: number
          discount_source?: Database["public"]["Enums"]["discount_source"]
          doctor_name?: string | null
          ep_le?: number | null
          ep_re?: number | null
          fitting_height?: number | null
          frame_revenue?: number
          id?: string
          le_add?: number | null
          le_axis?: number | null
          le_cyl?: number | null
          le_sph?: number | null
          lens_details?: string | null
          lens_revenue?: number | null
          lens_type_id?: string | null
          prescription_date?: string | null
          prescription_photo_path?: string | null
          re_add?: number | null
          re_axis?: number | null
          re_cyl?: number | null
          re_sph?: number | null
          slip_number: number
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          total?: number | null
          vision_type_id?: string | null
        }
        Update: {
          booklet?: string
          cancel_note?: string | null
          cancel_reason_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string
          client_own_frame?: boolean
          created_at?: string
          created_by?: string | null
          custom_values?: Json
          delivered_at?: string | null
          discount_amount?: number
          discount_source?: Database["public"]["Enums"]["discount_source"]
          doctor_name?: string | null
          ep_le?: number | null
          ep_re?: number | null
          fitting_height?: number | null
          frame_revenue?: number
          id?: string
          le_add?: number | null
          le_axis?: number | null
          le_cyl?: number | null
          le_sph?: number | null
          lens_details?: string | null
          lens_revenue?: number | null
          lens_type_id?: string | null
          prescription_date?: string | null
          prescription_photo_path?: string | null
          re_add?: number | null
          re_axis?: number | null
          re_cyl?: number | null
          re_sph?: number | null
          slip_number?: number
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subtotal?: number
          total?: number | null
          vision_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cancel_reason_id_fkey"
            columns: ["cancel_reason_id"]
            isOneToOne: false
            referencedRelation: "settings_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_lens_type_id_fkey"
            columns: ["lens_type_id"]
            isOneToOne: false
            referencedRelation: "settings_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vision_type_id_fkey"
            columns: ["vision_type_id"]
            isOneToOne: false
            referencedRelation: "settings_list_items"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          method_id: string
          order_id: string
          received_at: string
          received_by: string | null
        }
        Insert: {
          amount: number
          id?: string
          kind: Database["public"]["Enums"]["payment_kind"]
          method_id: string
          order_id: string
          received_at?: string
          received_by?: string | null
        }
        Update: {
          amount?: number
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          method_id?: string
          order_id?: string
          received_at?: string
          received_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "settings_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_balances"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_numbers"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          is_archived: boolean
          name: string
          product_type_id: string
          sale_price: number
          sort: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean
          name: string
          product_type_id: string
          sale_price: number
          sort?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean
          name?: string
          product_type_id?: string
          sale_price?: number
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_product_type_id_fkey"
            columns: ["product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      product_types: {
        Row: {
          created_at: string
          id: string
          is_archived: boolean
          is_frame: boolean
          key: string
          label_en: string
          label_fr: string
          sort: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_frame?: boolean
          key: string
          label_en: string
          label_fr: string
          sort?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_frame?: boolean
          key?: string
          label_en?: string
          label_fr?: string
          sort?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          locale: Database["public"]["Enums"]["app_locale"]
          role: Database["public"]["Enums"]["app_role"]
          store_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          locale?: Database["public"]["Enums"]["app_locale"]
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          locale?: Database["public"]["Enums"]["app_locale"]
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_lines: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          line_kind: Database["public"]["Enums"]["purchase_line_kind"]
          line_total: number | null
          purchase_id: string
          qty: number
          unit_price: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          line_kind: Database["public"]["Enums"]["purchase_line_kind"]
          line_total?: number | null
          purchase_id: string
          qty?: number
          unit_price: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          line_kind?: Database["public"]["Enums"]["purchase_line_kind"]
          line_total?: number | null
          purchase_id?: string
          qty?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_balances"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          purchase_date: string
          receive_store_id: string
          supplier_id: string
          supplier_ref: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          purchase_date?: string
          receive_store_id: string
          supplier_id: string
          supplier_ref?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          purchase_date?: string
          receive_store_id?: string
          supplier_id?: string
          supplier_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_receive_store_id_fkey"
            columns: ["receive_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_charges: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string | null
          day_of_month: number
          id: string
          is_active: boolean
          label: string
          location_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          created_by?: string | null
          day_of_month: number
          id?: string
          is_active?: boolean
          label: string
          location_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          day_of_month?: number
          id?: string
          is_active?: boolean
          label?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_charges_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "settings_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_charges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_charges_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "charge_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role: string
        }
        Insert: {
          permission: string
          role: string
        }
        Update: {
          permission?: string
          role?: string
        }
        Relationships: []
      }
      settings_list_items: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_archived: boolean
          label_en: string
          label_fr: string
          list_key: string
          meta: Json
          sort: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          label_en: string
          label_fr: string
          list_key: string
          meta?: Json
          sort?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          label_en?: string
          label_fr?: string
          list_key?: string
          meta?: Json
          sort?: number
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["stock_movement_kind"]
          qty_delta: number
          reason: string | null
          reason_id: string | null
          ref_id: string | null
          ref_table: string | null
          store_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["stock_movement_kind"]
          qty_delta: number
          reason?: string | null
          reason_id?: string | null
          ref_id?: string | null
          ref_table?: string | null
          store_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["stock_movement_kind"]
          qty_delta?: number
          reason?: string | null
          reason_id?: string | null
          ref_id?: string | null
          ref_table?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "settings_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["store_kind"]
          name: string
          phone: string | null
          prefix: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["store_kind"]
          name: string
          phone?: string | null
          prefix: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["store_kind"]
          name?: string
          phone?: string | null
          prefix?: string
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          method_id: string
          note: string | null
          paid_at: string
          purchase_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          method_id: string
          note?: string | null
          paid_at?: string
          purchase_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method_id?: string
          note?: string | null
          paid_at?: string
          purchase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "settings_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_balances"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "supplier_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_archived: boolean
          name: string
          note: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          name: string
          note?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          note?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_lines: {
        Row: {
          category_id: string
          created_at: string
          id: string
          qty: number
          transfer_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          qty: number
          transfer_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          qty?: number
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_lines_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          created_at: string
          created_by: string | null
          from_store_id: string
          id: string
          note: string | null
          to_store_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_store_id: string
          id?: string
          note?: string | null
          to_store_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_store_id?: string
          id?: string
          note?: string | null
          to_store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_store_id_fkey"
            columns: ["from_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_store_id_fkey"
            columns: ["to_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      order_balances: {
        Row: {
          balance: number | null
          order_id: string | null
          paid: number | null
          status: Database["public"]["Enums"]["order_status"] | null
          store_id: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_numbers: {
        Row: {
          display_number: string | null
          order_id: string | null
          store_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_balances: {
        Row: {
          paid: number | null
          purchase_id: string | null
          remaining: number | null
          supplier_id: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          category_id: string | null
          quantity: number | null
          store_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_payment: {
        Args: { p_amount: number; p_method_id: string; p_order_id: string }
        Returns: string
      }
      add_supplier_payment: {
        Args: {
          p_amount: number
          p_method_id?: string
          p_note?: string
          p_paid_at?: string
          p_purchase_id: string
        }
        Returns: string
      }
      adjust_stock: {
        Args: {
          p_category_id: string
          p_counted_qty: number
          p_note?: string
          p_reason_id: string
          p_store_id: string
        }
        Returns: undefined
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          email_confirmed_at: string
          full_name: string
          id: string
          invited_at: string
          is_active: boolean
          last_sign_in_at: string
          locale: Database["public"]["Enums"]["app_locale"]
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
        }[]
      }
      admin_update_user_access: {
        Args: {
          p_is_active: boolean
          p_role: Database["public"]["Enums"]["app_role"]
          p_store_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      apply_free_discount: {
        Args: { p_amount: number; p_order_id: string }
        Returns: undefined
      }
      approve_charge: {
        Args: { p_amount?: number; p_charge_id: string }
        Returns: undefined
      }
      auth_role: { Args: never; Returns: string }
      auth_store_id: { Args: never; Returns: string }
      business_date: { Args: { ts: string }; Returns: string }
      cancel_order: {
        Args: {
          p_note?: string
          p_order_id: string
          p_reason_id: string
          p_refund_amount?: number
          p_refund_method_id?: string
        }
        Returns: undefined
      }
      change_order_status: {
        Args: {
          p_order_id: string
          p_to_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: undefined
      }
      clear_client_discount: {
        Args: { p_client_id: string }
        Returns: undefined
      }
      client_order_stats: { Args: { p_client_id: string }; Returns: Json }
      create_order: { Args: { payload: Json }; Returns: Json }
      create_purchase: { Args: { payload: Json }; Returns: string }
      create_transfer: {
        Args: {
          p_from_store_id: string
          p_lines: Json
          p_note?: string
          p_to_store_id: string
        }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      deliver_order: {
        Args: { p_final_payment?: Json; p_order_id: string }
        Returns: undefined
      }
      format_order_number: {
        Args: {
          booklet: string
          digits: number
          prefix: string
          slip_number: number
        }
        Returns: string
      }
      generate_recurring_charges: { Args: { p_date?: string }; Returns: number }
      is_super_admin: { Args: never; Returns: boolean }
      is_valid_diopter: { Args: { value: number }; Returns: boolean }
      notify_stuck_orders: { Args: never; Returns: number }
      record_damage: {
        Args: {
          p_category_id: string
          p_qty: number
          p_reason: string
          p_store_id: string
        }
        Returns: undefined
      }
      search_global: { Args: { q: string }; Returns: Json }
      set_client_discount: {
        Args: {
          p_client_id: string
          p_note?: string
          p_type: Database["public"]["Enums"]["discount_type"]
          p_value: number
        }
        Returns: undefined
      }
      storage_order_id: { Args: { p_name: string }; Returns: string }
    }
    Enums: {
      app_locale: "fr" | "en"
      app_role: "super_admin" | "secretary"
      audit_action: "insert" | "update" | "delete"
      charge_status: "approved" | "pending"
      custom_field_type: "text" | "number" | "select" | "date"
      discount_source: "none" | "client_pending" | "admin_free"
      discount_type: "percent" | "amount"
      field_visibility: "hidden" | "optional" | "required"
      order_source: "app" | "legacy"
      order_status:
        | "confirmed"
        | "in_workshop"
        | "prepared"
        | "in_store"
        | "delivered"
        | "cancelled"
      payment_kind: "deposit" | "balance" | "refund"
      purchase_line_kind: "stock" | "lens"
      stock_movement_kind:
        | "purchase"
        | "sale"
        | "sale_cancel"
        | "transfer_out"
        | "transfer_in"
        | "damage"
        | "adjustment"
      store_kind: "store" | "lab"
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
      app_locale: ["fr", "en"],
      app_role: ["super_admin", "secretary"],
      audit_action: ["insert", "update", "delete"],
      charge_status: ["approved", "pending"],
      custom_field_type: ["text", "number", "select", "date"],
      discount_source: ["none", "client_pending", "admin_free"],
      discount_type: ["percent", "amount"],
      field_visibility: ["hidden", "optional", "required"],
      order_source: ["app", "legacy"],
      order_status: [
        "confirmed",
        "in_workshop",
        "prepared",
        "in_store",
        "delivered",
        "cancelled",
      ],
      payment_kind: ["deposit", "balance", "refund"],
      purchase_line_kind: ["stock", "lens"],
      stock_movement_kind: [
        "purchase",
        "sale",
        "sale_cancel",
        "transfer_out",
        "transfer_in",
        "damage",
        "adjustment",
      ],
      store_kind: ["store", "lab"],
    },
  },
} as const
