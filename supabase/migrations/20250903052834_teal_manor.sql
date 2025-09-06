/*
  # Initial Database Schema

  1. New Tables
    - `users`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text, unique)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    - `personas` 
      - `id` (uuid, primary key)
      - `username` (text, unique)
      - `channel_id` (text, unique per user)
      - `title` (text, channel name)
      - `description` (text, channel description)
      - `thumbnail_url` (text, channel avatar)
      - `subscriber_count` (integer)
      - `video_count` (integer) 
      - `continuation_token` (text, for pagination)
      - `top_k` (integer, similarity search limit)
      - `user_id` (uuid, foreign key to users)
      - `is_public` (boolean, public visibility)
      - `discovery_status` (text, processing status)
      - `last_video_discovered` (timestamp)
      - `created_at`, `updated_at` (timestamps)
    - `videos`
      - `id` (uuid, primary key)
      - `persona_id` (uuid, foreign key to personas)
      - `video_id` (text, YouTube video ID)
      - `title`, `description` (text)
      - `thumbnail_url` (text)
      - `duration` (text, formatted duration)
      - `published_at` (timestamp)
      - `view_count` (integer)
      - `captions_status` (text, processing status)
      - `captions_error` (text, error message)
      - `created_at`, `updated_at` (timestamps)
    - `captions`
      - `id` (uuid, primary key)
      - `video_id` (text, references videos.video_id)
      - `start_time` (text, seconds)
      - `duration` (text, seconds)
      - `text` (text, caption content)
      - `embedding` (vector, for similarity search)
      - `created_at` (timestamp)
    - `messages`
      - `id` (uuid, primary key)
      - `persona_id` (uuid, foreign key to personas)
      - `user_id` (uuid, nullable for anonymous chats)
      - `role` (text, 'user' or 'assistant')
      - `content` (text, message content)
      - `video_references` (jsonb, referenced video segments)
      - `created_at` (timestamp)
    - `jobs`
      - `id` (uuid, primary key)
      - `type` (text, job type)
      - `payload` (jsonb, job parameters)
      - `status` (text, 'pending', 'running', 'completed', 'failed')
      - `progress` (integer, 0-100)
      - `error_message` (text, error details)
      - `result` (jsonb, job output)
      - `idempotency_key` (text, unique, prevent duplicates)
      - `retry_count`, `max_retries` (integer)
      - `scheduled_at`, `started_at`, `completed_at` (timestamps)
      - `created_at`, `updated_at` (timestamps)

  2. Security
    - Enable RLS on all tables
    - Users can only access their own personas and messages
    - Public personas are viewable by everyone
    - Anonymous users can view public personas and send messages

  3. Functions
    - `match_captions` function for vector similarity search
    - Indexes on frequently queried columns
    - Unique constraints for data integrity

  4. Extensions
    - Enable vector extension for embeddings
    - Enable pgcrypto for UUID generation
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Personas table
CREATE TABLE IF NOT EXISTS personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  channel_id text NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  thumbnail_url text NOT NULL,
  subscriber_count integer DEFAULT 0,
  video_count integer DEFAULT 0,
  continuation_token text,
  top_k integer DEFAULT 5,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  is_public boolean DEFAULT true,
  discovery_status text DEFAULT 'pending',
  last_video_discovered timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- Videos table
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid REFERENCES personas(id) ON DELETE CASCADE,
  video_id text UNIQUE NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  thumbnail_url text NOT NULL,
  duration text DEFAULT '0:00',
  published_at timestamptz NOT NULL,
  view_count integer DEFAULT 0,
  captions_status text DEFAULT 'pending',
  captions_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Captions table with vector embeddings
CREATE TABLE IF NOT EXISTS captions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text REFERENCES videos(video_id) ON DELETE CASCADE,
  start_time text NOT NULL,
  duration text NOT NULL,
  text text NOT NULL,
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid REFERENCES personas(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  video_references jsonb,
  created_at timestamptz DEFAULT now()
);

-- Jobs table for background processing
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message text,
  result jsonb,
  idempotency_key text UNIQUE NOT NULL,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  scheduled_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_personas_user_id ON personas(user_id);
CREATE INDEX IF NOT EXISTS idx_personas_username ON personas(username);
CREATE INDEX IF NOT EXISTS idx_personas_is_public ON personas(is_public);
CREATE INDEX IF NOT EXISTS idx_videos_persona_id ON videos(persona_id);
CREATE INDEX IF NOT EXISTS idx_videos_video_id ON videos(video_id);
CREATE INDEX IF NOT EXISTS idx_captions_video_id ON captions(video_id);
CREATE INDEX IF NOT EXISTS idx_captions_embedding ON captions USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_messages_persona_id ON messages(persona_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_jobs_idempotency_key ON jobs(idempotency_key);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE captions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for personas
CREATE POLICY "Anyone can read public personas"
  ON personas FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can read own personas"
  ON personas FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own personas"
  ON personas FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own personas"
  ON personas FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own personas"
  ON personas FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for videos
CREATE POLICY "Videos are accessible if persona is accessible"
  ON videos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM personas 
      WHERE personas.id = videos.persona_id 
      AND (personas.is_public = true OR personas.user_id = auth.uid())
    )
  );

CREATE POLICY "System can manage videos"
  ON videos FOR ALL
  TO service_role
  USING (true);

-- RLS Policies for captions
CREATE POLICY "Captions are accessible if video is accessible"
  ON captions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM videos v
      JOIN personas p ON v.persona_id = p.id
      WHERE v.video_id = captions.video_id
      AND (p.is_public = true OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "System can manage captions"
  ON captions FOR ALL
  TO service_role
  USING (true);

-- RLS Policies for messages
CREATE POLICY "Users can read messages from accessible personas"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM personas 
      WHERE personas.id = messages.persona_id 
      AND (personas.is_public = true OR personas.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can create messages for accessible personas"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM personas 
      WHERE personas.id = messages.persona_id 
      AND (personas.is_public = true OR personas.user_id = auth.uid())
    )
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY "System can manage messages"
  ON messages FOR ALL
  TO service_role
  USING (true);

-- RLS Policies for jobs (service role only)
CREATE POLICY "Only service role can access jobs"
  ON jobs FOR ALL
  TO service_role
  USING (true);

-- Function for vector similarity search
CREATE OR REPLACE FUNCTION match_captions (
  query_embedding vector(1536),
  persona_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  video_id text,
  video_title text,
  start_time text,
  duration text,
  text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.video_id,
    v.title as video_title,
    c.start_time,
    c.duration,
    c.text,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM captions c
  JOIN videos v ON c.video_id = v.video_id
  WHERE v.persona_id = match_captions.persona_id
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Trigger to automatically insert/update users table
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email, created_at, updated_at)
  values (new.id, new.email, now(), now())
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;


-- Trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update timestamps trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers to relevant tables
CREATE TRIGGER update_personas_updated_at
  BEFORE UPDATE ON personas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON videos  
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();