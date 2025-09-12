/*
  # Create Chat Sessions Table

  1. New Tables
    - `chat_sessions`
      - `id` (uuid, primary key)
      - `persona_id` (uuid, foreign key to personas)
      - `user_id` (uuid, foreign key to users, nullable for anonymous)
      - `title` (text, chat session title)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Table Modifications
    - Add `chat_session_id` column to `messages` table

  3. Security
    - Enable RLS on `chat_sessions` table
    - Add policies for chat session access
    - Update message policies to work with chat sessions
*/

-- Create chat_sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid REFERENCES personas(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add chat_session_id to messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'chat_session_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN chat_session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_persona_id ON chat_sessions(persona_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_session_id ON messages(chat_session_id);

-- Enable RLS
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_sessions
CREATE POLICY "Users can read own chat sessions"
  ON chat_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read public persona chat sessions"
  ON chat_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM personas 
      WHERE personas.id = chat_sessions.persona_id 
      AND personas.is_public = true
    )
  );

CREATE POLICY "Users can create chat sessions for accessible personas"
  ON chat_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM personas 
      WHERE personas.id = chat_sessions.persona_id 
      AND (personas.is_public = true OR personas.user_id = auth.uid())
    )
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY "Users can update own chat sessions"
  ON chat_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat sessions"
  ON chat_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Update messages policies to work with chat sessions
DROP POLICY IF EXISTS "Users can read messages from accessible personas" ON messages;
DROP POLICY IF EXISTS "Users can create messages for accessible personas" ON messages;

CREATE POLICY "Users can read messages from accessible chat sessions"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions cs
      JOIN personas p ON cs.persona_id = p.id
      WHERE cs.id = messages.chat_session_id 
      AND (p.is_public = true OR p.user_id = auth.uid() OR cs.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can create messages for accessible chat sessions"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions cs
      JOIN personas p ON cs.persona_id = p.id
      WHERE cs.id = messages.chat_session_id 
      AND (p.is_public = true OR p.user_id = auth.uid() OR cs.user_id = auth.uid())
    )
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Update timestamps trigger
CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();