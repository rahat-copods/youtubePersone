export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          created_at?: string
          updated_at?: string
        }
      }
      personas: {
        Row: {
          id: string
          username: string
          channel_id: string
          title: string
          description: string
          thumbnail_url: string
          video_count: number
          continuation_token: string | null
          top_k: number
          user_id: string
          is_public: boolean
          discovery_status: string
          last_video_discovered: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          username: string
          channel_id: string
          title: string
          description?: string
          thumbnail_url: string
          video_count?: number
          continuation_token?: string | null
          top_k?: number
          user_id: string
          is_public?: boolean
          discovery_status?: string
          last_video_discovered?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          channel_id?: string
          title?: string
          description?: string
          thumbnail_url?: string
          video_count?: number
          continuation_token?: string | null
          top_k?: number
          user_id?: string
          is_public?: boolean
          discovery_status?: string
          last_video_discovered?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      videos: {
        Row: {
          id: string
          persona_id: string
          video_id: string
          title: string
          description: string
          thumbnail_url: string
          duration: string
          published_at: string
          view_count: number
          captions_status: 'pending' | 'processing' | 'extracted' | 'completed' | 'failed'
          captions_error: string | null
          processing_started_at: string | null
          processing_completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          persona_id: string
          video_id: string
          title: string
          description?: string
          thumbnail_url: string
          duration?: string
          published_at: string
          view_count?: number
          captions_status?: 'pending' | 'processing' | 'extracted' | 'completed' | 'failed'
          captions_error?: string | null
          processing_started_at?: string | null
          processing_completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          persona_id?: string
          video_id?: string
          title?: string
          description?: string
          thumbnail_url?: string
          duration?: string
          published_at?: string
          view_count?: number
          captions_status?: 'pending' | 'processing' | 'extracted' | 'completed' | 'failed'
          captions_error?: string | null
          processing_started_at?: string | null
          processing_completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      captions: {
        Row: {
          id: string
          persona_id: string
          video_id: string
          start_time: string
          duration: string
          text: string
          embedding: number[] | null
          created_at: string
        }
        Insert: {
          id?: string
          persona_id: string
          video_id: string
          start_time: string
          duration: string
          text: string
          embedding?: number[] | null
          created_at?: string
        }
        Update: {
          id?: string
          persona_id?: string
          video_id?: string
          start_time?: string
          duration?: string
          text?: string
          embedding?: number[] | null
          created_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          persona_id: string
          user_id: string | null
          role: string
          content: string
          video_references: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          persona_id: string
          user_id?: string | null
          role: string
          content: string
          video_references?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          persona_id?: string
          user_id?: string | null
          role?: string
          content?: string
          video_references?: Json | null
          created_at?: string
        }
      }
      jobs: {
        Row: {
          id: string
          type: string
          payload: Json
          status: string
          progress: number
          error_message: string | null
          result: Json | null
          idempotency_key: string
          retry_count: number
          max_retries: number
          scheduled_at: string
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          type: string
          payload: Json
          status?: string
          progress?: number
          error_message?: string | null
          result?: Json | null
          idempotency_key: string
          retry_count?: number
          max_retries?: number
          scheduled_at?: string
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          type?: string
          payload?: Json
          status?: string
          progress?: number
          error_message?: string | null
          result?: Json | null
          idempotency_key?: string
          retry_count?: number
          max_retries?: number
          scheduled_at?: string
          started_at?: string | null
          completed_at?: string | null
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
    CompositeTypes: {
      [_ in never]: never
    }
  }
}