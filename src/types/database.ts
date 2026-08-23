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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
