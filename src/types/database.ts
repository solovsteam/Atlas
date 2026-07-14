export type DbItemRow = {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  is_task: boolean;
  task_status: string;
  manual_relevance: number;
  tags: unknown;
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
  task_status?: string;
  manual_relevance?: number;
  tags?: unknown;
  revision?: number;
  created_at?: string;
  updated_at?: string;
};

export type DbItemUpdate = Partial<Omit<DbItemRow, "id" | "owner_id" | "created_at">>;

export type Database = {
  public: {
    Tables: {
      items: {
        Row: DbItemRow;
        Insert: DbItemInsert;
        Update: DbItemUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
