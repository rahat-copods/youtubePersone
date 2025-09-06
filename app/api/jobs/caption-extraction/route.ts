import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractCaptions } from "@/lib/apify/caption-extraction";
import { OpenAI } from "openai";
import { z } from "zod";

const requestSchema = z.object({
  videoId: z.string(),
  personaId: z.string(),
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_API_BASE_URL,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId, personaId } = requestSchema.parse(body);

    const supabase = createClient();

    // Mark video as processing
    await supabase
      .from("videos")
      .update({ captions_status: "processing" })
      .eq("video_id", videoId);

    try {
      // Extract captions using Apify
      const captions = await extractCaptions(videoId);

      if (captions.length > 0) {
        // Generate embeddings for each caption
        const captionsWithEmbeddings = [];

        for (const caption of captions) {
          try {
            const embedding = await openai.embeddings.create({
              model: "text-embedding-005",
              input: caption.text,
            });

            captionsWithEmbeddings.push({
              video_id: videoId,
              start_time: caption.start,
              duration: caption.duration,
              text: caption.text,
              embedding: embedding.data[0].embedding,
            });
          } catch (embeddingError) {
            console.error("Embedding generation error:", embeddingError);
            // Continue with other captions even if one fails
          }
        }

        if (captionsWithEmbeddings.length > 0) {
          // Insert captions with embeddings
          const { error: insertError } = await supabase
            .from("captions")
            .insert(captionsWithEmbeddings);

          if (insertError) {
            throw new Error(
              `Failed to insert captions: ${insertError.message}`
            );
          }

          // Mark video as completed
          await supabase
            .from("videos")
            .update({ captions_status: "completed" })
            .eq("video_id", videoId);

          return NextResponse.json({
            captionsExtracted: captionsWithEmbeddings.length,
            success: true,
          });
        }
      }

      // No captions found or processed
      await supabase
        .from("videos")
        .update({
          captions_status: "failed",
          captions_error: "No captions available or processable",
        })
        .eq("video_id", videoId);

      return NextResponse.json({
        captionsExtracted: 0,
        success: false,
        message: "No captions available",
      });
    } catch (extractionError) {
      console.error("Caption extraction error:", extractionError);

      // Mark video as failed
      await supabase
        .from("videos")
        .update({
          captions_status: "failed",
          captions_error:
            extractionError instanceof Error
              ? extractionError.message
              : "Unknown error",
        })
        .eq("video_id", videoId);

      return NextResponse.json(
        { error: "Failed to extract captions" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Caption extraction API error:", error);
    return NextResponse.json(
      { error: "Invalid request or server error" },
      { status: 500 }
    );
  }
}
