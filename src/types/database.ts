export type DbItemRow = {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  is_task: boolean;
  is_documentation: boolean;
  is_interval: boolean;
  task_status: string;
  task_expected_minutes: number | null;
  parent_task_id: string | null;
  task_due_at: string | null;
  task_fixed_starts_at: string | null;
  task_fixed_ends_at: string | null;
  manual_relevance: number;
  tags: unknown;
  completion_rule: unknown;
  documentation_schema: unknown;
  documentation_data: unknown;
  recurrence_rule: unknown;
  recurrence_state?: unknown;
  generated_from_id: string | null;
  occurrence_key: string;
  overridden_fields: unknown;
  interval_kind: string;
  interval_starts_at: string;
  interval_ends_at: string;
  interval_status: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type DbItemInsert = {
  id?: string;
  owner_id: string;
  title?: string;
  body?: string;
  is_task?: boolean;
  is_documentation?: boolean;
  is_interval?: boolean;
  task_status?: string;
  task_expected_minutes?: number | null;
  parent_task_id?: string | null;
  task_due_at?: string | null;
  task_fixed_starts_at?: string | null;
  task_fixed_ends_at?: string | null;
  manual_relevance?: number;
  tags?: unknown;
  completion_rule?: unknown;
  documentation_schema?: unknown;
  documentation_data?: unknown;
  recurrence_rule?: unknown;
  recurrence_state?: unknown;
  generated_from_id?: string | null;
  occurrence_key?: string;
  overridden_fields?: unknown;
  interval_kind?: string;
  interval_starts_at?: string;
  interval_ends_at?: string;
  interval_status?: string;
  revision?: number;
  created_at?: string;
  updated_at?: string;
};

export type DbItemUpdate = Partial<Omit<DbItemRow, "id" | "owner_id" | "created_at">>;

export type DbItemLinkRow = {
  id: string;
  owner_id: string;
  from_id: string;
  to_id: string;
  kind: string;
  created_at: string;
  updated_at: string;
};

export type DbItemLinkInsert = {
  id?: string;
  owner_id: string;
  from_id: string;
  to_id: string;
  kind: string;
  created_at?: string;
  updated_at?: string;
};

export type DbSchemaScheduleRunRow = {
  id: string;
  owner_id: string;
  schema_run_id: string;
  plan_digest: string;
  plan: unknown;
  baseline: unknown;
  status: string;
  created_at: string;
  updated_at: string;
};

export type DbSchemaScheduleRunInsert = {
  id?: string;
  owner_id: string;
  schema_run_id: string;
  plan_digest: string;
  plan: unknown;
  baseline?: unknown;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

export type Database = {
  public: {
    Tables: {
      items: {
        Row: DbItemRow;
        Insert: DbItemInsert;
        Update: DbItemUpdate;
        Relationships: [];
      };
      item_links: {
        Row: DbItemLinkRow;
        Insert: DbItemLinkInsert;
        Update: Partial<Omit<DbItemLinkRow, "id" | "owner_id" | "created_at">>;
        Relationships: [];
      };
      schema_schedule_runs: {
        Row: DbSchemaScheduleRunRow;
        Insert: DbSchemaScheduleRunInsert;
        Update: Partial<Omit<DbSchemaScheduleRunRow, "id" | "owner_id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      atlas_preview_brain_edits: { Args: { p_plan: unknown }; Returns: unknown };
      atlas_apply_brain_edit_preview: { Args: { p_preview_id: string }; Returns: unknown };
      atlas_get_brain_edit_receipt: { Args: { p_request_id: string }; Returns: unknown };
      atlas_get_brain_edit_feedback: { Args: { p_request_id: string }; Returns: unknown };
      atlas_undo_brain_edits: { Args: { p_request_id: string; p_undo_request_id: string }; Returns: unknown };
      atlas_write_reference: {
        Args: { p_row: unknown; p_expected_revision: number; p_generator_revision?: number | null };
        Returns: unknown;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
