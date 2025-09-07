@@ .. @@
 -- Captions table with vector embeddings
 CREATE TABLE IF NOT EXISTS captions (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+  persona_id uuid REFERENCES personas(id) ON DELETE CASCADE,
   video_id text REFERENCES videos(video_id) ON DELETE CASCADE,
   start_time text NOT NULL,
   duration text NOT NULL,
   text text NOT NULL,
-  embedding vector(1536),
+  embedding vector(1536) DEFAULT NULL,
   created_at timestamptz DEFAULT now()
 );
@@ .. @@
 -- Indexes for performance
 CREATE INDEX IF NOT EXISTS idx_personas_user_id ON personas(user_id);
 CREATE INDEX IF NOT EXISTS idx_personas_username ON personas(username);
 CREATE INDEX IF NOT EXISTS idx_personas_is_public ON personas(is_public);
 CREATE INDEX IF NOT EXISTS idx_videos_persona_id ON videos(persona_id);
 CREATE INDEX IF NOT EXISTS idx_videos_video_id ON videos(video_id);
+CREATE INDEX IF NOT EXISTS idx_videos_captions_status ON videos(captions_status);
+CREATE INDEX IF NOT EXISTS idx_captions_persona_id ON captions(persona_id);
 CREATE INDEX IF NOT EXISTS idx_captions_video_id ON captions(video_id);
+CREATE INDEX IF NOT EXISTS idx_captions_embedding_null ON captions(persona_id) WHERE embedding IS NULL;
 CREATE INDEX IF NOT EXISTS idx_captions_embedding ON captions USING ivfflat (embedding vector_cosine_ops);
 CREATE INDEX IF NOT EXISTS idx_messages_persona_id ON messages(persona_id);
 CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
@@ .. @@
 -- RLS Policies for captions
 CREATE POLICY "Captions are accessible if video is accessible"
   ON captions FOR SELECT
   USING (
     EXISTS (
-      SELECT 1 FROM videos v
-      JOIN personas p ON v.persona_id = p.id
-      WHERE v.video_id = captions.video_id
-      AND (p.is_public = true OR p.user_id = auth.uid())
+      SELECT 1 FROM personas p
+      WHERE p.id = captions.persona_id
+      AND (p.is_public = true OR p.user_id = auth.uid())
     )
   );

 CREATE POLICY "System can manage captions"
   ON captions FOR ALL
   TO service_role
   USING (true);

+CREATE POLICY "Users can manage captions for own personas"
+  ON captions FOR ALL
+  TO authenticated
+  USING (
+    EXISTS (
+      SELECT 1 FROM personas p
+      WHERE p.id = captions.persona_id
+      AND p.user_id = auth.uid()
+    )
+  );
@@ .. @@
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
-  WHERE v.persona_id = match_captions.persona_id
+  WHERE c.persona_id = match_captions.persona_id
+    AND c.embedding IS NOT NULL
     AND 1 - (c.embedding <=> query_embedding) > match_threshold
   ORDER BY similarity DESC
   LIMIT match_count;
 END;
 $$;