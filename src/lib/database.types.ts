import type { Role, Unit, MovementType } from './domain';
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Profile = {
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
// Maintained against migration 202609090001. Regenerate using the Supabase CLI
// when a project is provisioned (see README), then review the generated diff.
export type Database = {
  public: {
    Tables: {
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
