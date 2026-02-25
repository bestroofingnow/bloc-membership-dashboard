export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: 'admin' | 'chapter_director' | 'member'
          chapter: 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: 'admin' | 'chapter_director' | 'member'
          chapter?: 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: 'admin' | 'chapter_director' | 'member'
          chapter?: 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni' | null
          created_at?: string
          updated_at?: string
        }
      }
      members: {
        Row: {
          id: string
          name: string
          company: string
          chapter: 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni'
          industry: string
          email: string | null
          phone: string | null
          join_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          company: string
          chapter: 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni'
          industry: string
          email?: string | null
          phone?: string | null
          join_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          company?: string
          chapter?: 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni'
          industry?: string
          email?: string | null
          phone?: string | null
          join_date?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      board_members: {
        Row: {
          id: string
          role: string
          name: string
          company: string
          email: string
          phone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          role: string
          name: string
          company: string
          email: string
          phone: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: string
          name?: string
          company?: string
          email?: string
          phone?: string
          created_at?: string
          updated_at?: string
        }
      }
      guests: {
        Row: {
          id: string
          name: string
          company: string
          industry: string | null
          invited_by: string
          email: string | null
          phone: string | null
          status: string
          next_step: string
          notes: string | null
          target_chapter: 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          company: string
          industry?: string | null
          invited_by: string
          email?: string | null
          phone?: string | null
          status?: string
          next_step: string
          notes?: string | null
          target_chapter?: 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          company?: string
          industry?: string | null
          invited_by?: string
          email?: string | null
          phone?: string | null
          status?: string
          next_step?: string
          notes?: string | null
          target_chapter?: 'North' | 'South' | 'Uptown' | 'FLOC' | 'Alumni' | null
          created_at?: string
          updated_at?: string
        }
      }
      industry_categories: {
        Row: {
          id: string
          name: string
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          display_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          display_order?: number
          created_at?: string
        }
      }
      industry_targets: {
        Row: {
          id: string
          category_id: string
          title: string
          priority: 'high' | 'medium' | 'low'
          assigned_to: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id: string
          title: string
          priority?: 'high' | 'medium' | 'low'
          assigned_to?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          title?: string
          priority?: 'high' | 'medium' | 'low'
          assigned_to?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
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
  }
}
