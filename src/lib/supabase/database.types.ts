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
      draft_actions: {
        Row: {
          action_type: string
          created_at: string
          draft_round_id: string
          fighter_id: number | null
          id: number
          offer_index: number
          round_index: number
          sequence: number
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          draft_round_id: string
          fighter_id?: number | null
          id?: never
          offer_index: number
          round_index: number
          sequence: number
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          draft_round_id?: string
          fighter_id?: number | null
          id?: never
          offer_index?: number
          round_index?: number
          sequence?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_actions_draft_round_id_fkey"
            columns: ["draft_round_id"]
            isOneToOne: false
            referencedRelation: "draft_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_builds: {
        Row: {
          actual_ovr: number | null
          best_seen_ovr: number | null
          build_snapshot: Json | null
          draft_round_id: string
          offer_index: number
          rerolls_left: number
          user_id: string
        }
        Insert: {
          actual_ovr?: number | null
          best_seen_ovr?: number | null
          build_snapshot?: Json | null
          draft_round_id: string
          offer_index?: number
          rerolls_left?: number
          user_id: string
        }
        Update: {
          actual_ovr?: number | null
          best_seen_ovr?: number | null
          build_snapshot?: Json | null
          draft_round_id?: string
          offer_index?: number
          rerolls_left?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_builds_draft_round_id_fkey"
            columns: ["draft_round_id"]
            isOneToOne: false
            referencedRelation: "draft_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_builds_draft_round_id_user_id_fkey"
            columns: ["draft_round_id", "user_id"]
            isOneToOne: true
            referencedRelation: "draft_participants"
            referencedColumns: ["draft_round_id", "user_id"]
          },
        ]
      }
      draft_participants: {
        Row: {
          draft_round_id: string
          locked_at: string | null
          progress: number
          user_id: string
        }
        Insert: {
          draft_round_id: string
          locked_at?: string | null
          progress?: number
          user_id: string
        }
        Update: {
          draft_round_id?: string
          locked_at?: string | null
          progress?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_participants_draft_round_id_fkey"
            columns: ["draft_round_id"]
            isOneToOne: false
            referencedRelation: "draft_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_rounds: {
        Row: {
          created_at: string
          draft_plan: Json
          draft_seed: string
          draft_version: number
          engine_version: string
          id: string
          pool_version: number
          ratings_version: number
          revealed_at: string | null
          round_number: number
          series_id: string
          status: string
        }
        Insert: {
          created_at?: string
          draft_plan: Json
          draft_seed: string
          draft_version: number
          engine_version: string
          id?: string
          pool_version: number
          ratings_version: number
          revealed_at?: string | null
          round_number: number
          series_id: string
          status?: string
        }
        Update: {
          created_at?: string
          draft_plan?: Json
          draft_seed?: string
          draft_version?: number
          engine_version?: string
          id?: string
          pool_version?: number
          ratings_version?: number
          revealed_at?: string | null
          round_number?: number
          series_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_rounds_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      fights: {
        Row: {
          created_at: string
          draft_round_id: string
          engine_version: string
          fight_number: number
          fight_seed: string
          finish_round: number
          finish_time: number
          id: string
          method: string
          request_id: string | null
          result_json: Json
          series_id: string
          winner_user_id: string | null
        }
        Insert: {
          created_at?: string
          draft_round_id: string
          engine_version: string
          fight_number: number
          fight_seed: string
          finish_round: number
          finish_time: number
          id?: string
          method: string
          request_id?: string | null
          result_json: Json
          series_id: string
          winner_user_id?: string | null
        }
        Update: {
          created_at?: string
          draft_round_id?: string
          engine_version?: string
          fight_number?: number
          fight_seed?: string
          finish_round?: number
          finish_time?: number
          id?: string
          method?: string
          request_id?: string | null
          result_json?: Json
          series_id?: string
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fights_draft_round_id_fkey"
            columns: ["draft_round_id"]
            isOneToOne: false
            referencedRelation: "draft_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fights_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "series_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fights_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_key: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_key?: string | null
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_key?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      series: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          invite_token: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          invite_token: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          invite_token?: string
          status?: string
        }
        Relationships: []
      }
      series_participants: {
        Row: {
          display_name: string
          joined_at: string
          seat: number
          series_id: string
          user_id: string
        }
        Insert: {
          display_name: string
          joined_at?: string
          seat: number
          series_id: string
          user_id: string
        }
        Update: {
          display_name?: string
          joined_at?: string
          seat?: number
          series_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_participants_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      series_requests: {
        Row: {
          after_fight_id: string
          created_at: string
          id: string
          kind: string
          requested_by: string
          resolved_at: string | null
          series_id: string
          status: string
        }
        Insert: {
          after_fight_id: string
          created_at?: string
          id?: string
          kind: string
          requested_by: string
          resolved_at?: string | null
          series_id: string
          status?: string
        }
        Update: {
          after_fight_id?: string
          created_at?: string
          id?: string
          kind?: string
          requested_by?: string
          resolved_at?: string | null
          series_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_requests_after_fight_id_fkey"
            columns: ["after_fight_id"]
            isOneToOne: false
            referencedRelation: "fights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_requests_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
