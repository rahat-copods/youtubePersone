import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { OpenAI } from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { z } from "zod";

const requestSchema = z.object({
  personaId: z.string(),
  videoId: z.string().optional(),
  channelId: z.string(),
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_API_BASE_URL,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { personaId, videoId, channelId } = requestSchema.parse(body);
    const supabase = serviceClient;

    // Get Pinecone index for this persona
    const index = pinecone.index(channelId.toLowerCase());

    // Build query to find captions that need embedding (limit to 100)
    let query = supabase
      .from("captions")
      .select("id, text, video_id")
      .eq("persona_id", personaId)
      .eq("embedding", false)
      .limit(100);

    // If videoId is provided, filter by that specific video
    if (videoId) {
      query = query.eq("video_id", videoId);
    }

    const { data: captions, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch captions: ${fetchError.message}`);
    }

    console.log("Captions needing embeddings:", captions.length);

    if (!captions || captions.length === 0) {
      return NextResponse.json({
        message: videoId
          ? "No captions found for this video that need embedding"
          : "No captions found for this persona that need embedding",
        embeddingsProcessed: 0,
        success: true,
      });
    }

    let processedCount = 0;
    const batchSize = 10; // Process 10 at a time

    // Process captions in batches of 10
    for (let i = 0; i < captions.length; i += batchSize) {
      const batch = captions.slice(i, i + batchSize);

      const embeddingPromises = batch.map(async (caption) => {
        try {
          // Generate embedding with OpenAI
          const embeddingResponse = await openai.embeddings.create({
            model: "gemini-embedding-001",
            input: caption.text,
          });

          const embedding = embeddingResponse.data[0].embedding;

          // Store embedding in Pinecone
          await index.upsert([
            {
              id: caption.id,
              values: embedding,
              metadata: {
                text: caption.text,
                video_id: caption.video_id,
                persona_id: personaId,
              },
            },
          ]);

          // Update Supabase to mark embedding as completed
          const { error: updateError } = await supabase
            .from("captions")
            .update({ embedding: true })
            .eq("id", caption.id);

          if (updateError) {
            console.error(
              `Failed to update caption ${caption.id} in Supabase:`,
              updateError
            );
            return false;
          }

          return true;
        } catch (error) {
          console.error(
            `Failed to process embedding for caption ${caption.id}:`,
            error
          );
          return false;
        }
      });

      // Wait for current batch to complete before moving to next batch
      const results = await Promise.all(embeddingPromises);
      const batchProcessedCount = results.filter(Boolean).length;
      processedCount += batchProcessedCount;

      console.log(
        `Batch ${
          Math.floor(i / batchSize) + 1
        }: Processed ${batchProcessedCount}/${batch.length} embeddings`
      );
    }

    // If processing a specific video, check if all captions for that video are now embedded
    if (videoId) {
      const { data: remainingCaptions } = await supabase
        .from("captions")
        .select("id")
        .eq("video_id", videoId)
        .eq("persona_id", personaId)
        .eq("embedding", false); // Changed from .is("embedding", null)

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
        ? `Processed ${processedCount} embeddings for video (stored in Pinecone index: ${personaId})`
        : `Processed ${processedCount} embeddings for persona (stored in Pinecone index: ${personaId})`,
    });
  } catch (err) {
    console.error("Caption embedding error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to process embeddings",
        success: false,
      },
      { status: 500 }
    );
  }
}
