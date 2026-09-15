import type { Role, Unit, MovementType } from './domain';
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type OperationalDocument = {
  id: string;
  title: string;
  description: string;
  category: string;
  expiry_date: string | null;
  favorite: boolean;
  archived: boolean;
  access_level: 'OWNERS' | 'MANAGERS' | 'STAFF' | 'SELECTED';
  selected_users: string[];
  current_file_id: string | null;
  version: number;
  created_by: string;
  created_at: string;
  uploaded_by: string | null;
  uploaded_at: string | null;
  updated_by: string;
  updated_at: string;
};
export type DocumentFile = {
  id: string;
  document_id: string;
  object_path: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  ready: boolean;
  base_version: number;
  uploaded_by: string;
  created_at: string;
  uploaded_at: string | null;
};
export type TaskStatus = 'NEED_REVIEW' | 'IN_PROGRESS' | 'DONE';
export type Task = {
  id: string;
  title: string;
  description: string;
  type_code: string;
  status: TaskStatus;
  assignee_id: string | null;
  due_date: string | null;
  remind_at: string | null;
  product_id: string | null;
  need_id: string | null;
  receipt_id: string | null;
  location_id: string | null;
  related_task_id: string | null;
  archived: boolean;
  version: number;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
};
export type TaskSubtask = {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
};
export type TaskType = { code: string; name_en: string; name_es: string; active: boolean };
export type PurchaseNeed = {
  id: string;
  name: string;
  product_id: string | null;
  location_id: string | null;
  country: 'BELIZE' | 'USA';
  product_url: string;
  comment: string;
  status: 'PENDING' | 'ORDERED' | 'DONE';
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  version: number;
  photo_path: string | null;
  photo_hash: string | null;
  photo_size: number | null;
  photo_ready: boolean;
};
export type Profile = {
  must_change_password: boolean;
  account_admin: boolean;
  credential_pending: boolean;
  credential_epoch: number;
  id: string;
  display_name: string;
  role: Role;
  active: boolean;
  language: 'en' | 'es';
  created_at: string;
  updated_at: string;
};
export type Location = {
  id: string;
  name: string;
  type: 'BOAT' | 'STORAGE' | 'OFFICE' | 'OTHER';
  active: boolean;
  created_at: string;
};
export type Category = { id: string; name_en: string; name_es: string; active: boolean };
export type Spending = {
  id: string;
  category_id: string;
  amount: number;
  currency: 'BZD' | 'USD';
  location_id: string;
  paid_by: string;
  payment_method: 'CASH' | 'COMPANY_CARD' | 'PERSONAL_MONEY' | 'BANK_TRANSFER' | 'OTHER';
  occurred_at: string;
  notes: string;
  created_by: string;
  created_at: string;
};
export type Receipt = {
  id: string;
  expense_id: string | null;
  purchase_id: string | null;
  uploaded_by: string;
  object_path: string;
  content_sha256: string;
  byte_size: number;
  status: 'PENDING' | 'READY';
  created_at: string;
};
export type Product = {
  id: string;
  name: string;
  category_id: string;
  description: string;
  photo_path: string | null;
  unit: Unit;
  estimated_unit_cost: number | null;
  cost_currency: 'BZD' | 'USD';
  active: boolean;
  created_at: string;
  updated_at: string;
};
export type Balance = {
  product_id: string;
  location_id: string;
  quantity: number;
  minimum_stock: number | null;
  target_stock: number | null;
  updated_at: string;
};
export type Movement = {
  reverses_transaction_id?: string | null;
  transfer_id: string | null;
  related_location_id: string | null;
  id: string;
  request_id: string;
  product_id: string;
  location_id: string;
  transaction_type: MovementType;
  quantity: number;
  previous_quantity: number;
  resulting_quantity: number;
  reason: string;
  notes: string;
  performed_by_user_id: string;
  created_at: string;
};
type Table<Row, Insert = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
};
// Maintained against migrations through 20260911000300. Regenerate using the
// Supabase CLI after applying migrations, then review the generated diff.
export type Database = {
  public: {
    Tables: {
      documents: Table<OperationalDocument>;
      document_files: Table<DocumentFile>;
      tasks: Table<Task>;
      task_subtasks: Table<TaskSubtask>;
      task_types: Table<TaskType>;
      purchase_needs: Table<PurchaseNeed>;
      receipt_intake: Table<{
        content_type: string;
        original_preserved: boolean;
        id: string;
        uploaded_by: string;
        created_at: string;
        receipt_type: 'FUEL' | 'STORE';
        payment_method: 'CASH' | 'CARD' | 'CREDIT';
        object_path: string;
        content_sha256: string;
        byte_size: number;
        upload_ready: boolean;
        status: 'NEW' | 'REVIEWED' | 'ARCHIVED';
        review_details: Json;
        reviewed_by: string | null;
        reviewed_at: string | null;
      }>;
      expense_categories: Table<Category>;
      expenses: Table<Spending>;
      purchases: Table<Spending & { status: 'DRAFT' }>;
      receipts: Table<Receipt>;
      profiles: Table<Profile>;
      locations: Table<Location, Pick<Location, 'name' | 'type'> & Partial<Location>>;
      categories: Table<Category, Pick<Category, 'name_en' | 'name_es'> & Partial<Category>>;
      products: Table<Product, Pick<Product, 'name' | 'category_id'> & Partial<Product>>;
      inventory_balances: Table<Balance>;
      inventory_transactions: Table<Movement>;
      location_assignments: Table<{ user_id: string; location_id: string }>;
      audit_events: Table<{
        id: string;
        actor_id: string | null;
        entity_type: string;
        entity_id: string;
        action: string;
        location_id: string | null;
        before_data: Json | null;
        after_data: Json | null;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      save_document: {
        Args: {
          p_request: string;
          p_id: string;
          p_version: number;
          p_values: Json;
          p_file: Json | null;
        };
        Returns: Json;
      };
      complete_document_file: { Args: { p_file: string }; Returns: string };
      document_people: {
        Args: Record<string, never>;
        Returns: { id: string; display_name: string; active: boolean }[];
      };
      document_history: {
        Args: { p_id: string };
        Returns: Database['public']['Tables']['audit_events']['Row'][];
      };
      manage_task: {
        Args: {
          p_request: string;
          p_id: string;
          p_version: number;
          p_action: string;
          p_values: Json;
        };
        Returns: string;
      };
      task_people: {
        Args: Record<string, never>;
        Returns: { id: string; display_name: string; active: boolean }[];
      };
      task_history: {
        Args: { p_id: string };
        Returns: Database['public']['Tables']['audit_events']['Row'][];
      };
      item_change_history: { Args: { p_id: string; p_page?: number }; Returns: Json };
      quick_add_item: {
        Args: {
          p_request: string;
          p_location: string;
          p_product: string | null;
          p_name: string;
          p_category: string | null;
          p_quantity: number;
          p_unit: Product['unit'];
          p_minimum: number | null;
          p_confirm_duplicate: boolean;
        };
        Returns: string;
      };
      manage_staff: {
        Args: { p_id: string; p_name: string; p_role: Role; p_language: string; p_active: boolean };
        Returns: undefined;
      };
      begin_account_change: {
        Args: { p_request: string; p_target: string | null; p_kind: string };
        Returns: Json;
      };
      finish_account_change: {
        Args: { p_request: string; p_target: string; p_values: Json };
        Returns: undefined;
      };
      set_account_admin: { Args: { p_target: string; p_enabled: boolean }; Returns: undefined };

      quick_add_stock: {
        Args: {
          p_request: string;
          p_location: string;
          p_product: string | null;
          p_name: string;
          p_category: string | null;
          p_quantity: number;
          p_confirm_duplicate: boolean;
        };
        Returns: string;
      };
      save_purchase_need: {
        Args: {
          p_request: string;
          p_id: string;
          p_values: Json;
          p_version: number;
          p_confirm_duplicate: boolean;
        };
        Returns: string;
      };
      reserve_need_photo: {
        Args: { p_id: string; p_hash: string; p_size: number };
        Returns: string;
      };
      complete_need_photo: { Args: { p_id: string }; Returns: undefined };
      reserve_original_receipt: {
        Args: {
          p_id: string;
          p_type: string;
          p_payment: string;
          p_hash: string;
          p_size: number;
          p_mime: string;
        };
        Returns: string;
      };
      configure_item: { Args: { p_id: string; p_values: Json }; Returns: undefined };
      archive_inventory_item: { Args: { p_id: string }; Returns: undefined };
      reverse_stock: { Args: { p_request: string; p_original: string }; Returns: string };
      capture_receipt: {
        Args: { p_id: string; p_type: string; p_payment: string; p_hash: string; p_size: number };
        Returns: string;
      };
      complete_intake: { Args: { p_id: string }; Returns: undefined };
      review_intake: {
        Args: { p_id: string; p_status: string; p_details: Json };
        Returns: undefined;
      };
      save_inventory_items: { Args: { p_id: string; p_rows: Json }; Returns: string };
      record_spending: {
        Args: {
          p_id: string;
          p_kind: string;
          p_category_id: string;
          p_amount: string;
          p_currency: string;
          p_location_id: string;
          p_paid_by: string;
          p_payment_method: string;
          p_occurred_at: string;
          p_notes: string;
        };
        Returns: string;
      };
      reserve_receipt: {
        Args: {
          p_id: string;
          p_expense_id: string | null;
          p_purchase_id: string | null;
          p_sha256: string;
          p_size: number;
        };
        Returns: string;
      };
      complete_receipt: { Args: { p_id: string }; Returns: undefined };
      transfer_stock: {
        Args: {
          p_request_id: string;
          p_product_id: string;
          p_source_id: string;
          p_destination_id: string;
          p_quantity: number;
          p_notes?: string;
        };
        Returns: string;
      };
      change_stock: {
        Args: {
          p_request_id: string;
          p_product_id: string;
          p_location_id: string;
          p_quantity: number;
          p_type: MovementType;
          p_reason: string;
          p_notes?: string;
        };
        Returns: string;
      };
      set_language: { Args: { p_language: string }; Returns: undefined };
      configure_inventory: {
        Args: {
          p_product_id: string;
          p_location_id: string;
          p_minimum: number | null;
          p_target: number | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: Role;
      stock_unit: Unit;
      movement_type: MovementType;
      location_type: Location['type'];
    };
    CompositeTypes: Record<string, never>;
  };
};
