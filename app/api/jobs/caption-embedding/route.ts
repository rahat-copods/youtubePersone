import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { OpenAI } from "openai";
import { z } from "zod";

const requestSchema = z.object({
  personaId: z.string(),
  videoId: z.string().optional(),
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_API_BASE_URL,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { personaId, videoId } = requestSchema.parse(body);
    const supabase = serviceClient;

    // Build query to find captions that need embedding
    let query = supabase
      .from("captions")
      .select("id, text, video_id")
      .eq("persona_id", personaId)
      .is("embedding", null);

    // If videoId is provided, filter by that specific video
    if (videoId) {
      query = query.eq("video_id", videoId);
    }

    const { data: captions, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch captions: ${fetchError.message}`);
    }

    if (!captions || captions.length === 0) {
      return NextResponse.json({
        message: videoId 
          ? "No captions found for this video that need embedding"
          : "No captions found for this persona that need embedding",
        embeddingsProcessed: 0,
        success: true
      });
    }

    let processedCount = 0;
    const batchSize = 10; // Process in batches to avoid overwhelming the API

    // Process captions in batches
    for (let i = 0; i < captions.length; i += batchSize) {
      const batch = captions.slice(i, i + batchSize);
      
      const embeddingPromises = batch.map(async (caption) => {
        try {
          const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: caption.text,
          });

          const embedding = embeddingResponse.data[0].embedding;

          // Update the caption with the embedding
          const { error: updateError } = await supabase
            .from("captions")
            .update({ embedding })
            .eq("id", caption.id);

          if (updateError) {
            console.error(`Failed to update caption ${caption.id}:`, updateError);
            return false;
          }

          return true;
        } catch (error) {
          console.error(`Failed to generate embedding for caption ${caption.id}:`, error);
          return false;
        }
      });

      const results = await Promise.all(embeddingPromises);
      processedCount += results.filter(Boolean).length;
    }

    // If processing a specific video, check if all captions for that video are now embedded
    if (videoId) {
      const { data: remainingCaptions } = await supabase
        .from("captions")
        .select("id")
        .eq("video_id", videoId)
        .eq("persona_id", personaId)
        .is("embedding", null);

      // If no captions remain without embeddings, mark video as completed
      if (!remainingCaptions || remainingCaptions.length === 0) {
        await supabase
          .from("videos")
          .update({ captions_status: "completed" })
          .eq("video_id", videoId);
      }
    }

    return NextResponse.json({
      embeddingsProcessed: processedCount,
      totalCaptions: captions.length,
      success: true,
      message: videoId 
        ? `Processed ${processedCount} embeddings for video`
        : `Processed ${processedCount} embeddings for persona`
    });

  } catch (err) {
    console.error("Caption embedding error:", err);
    return NextResponse.json(
      { 
        error: err instanceof Error ? err.message : "Failed to process embeddings",
        success: false
      },
      { status: 500 }
    );
  }
}