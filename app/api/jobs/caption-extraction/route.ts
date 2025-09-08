import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import {
  startApifyRun,
  fetchApifyResults,
} from "@/lib/apify/caption-extraction";
import { z } from "zod";
import { ensurePineconeIndex } from "@/lib/pinecone/createIndex";

const requestSchema = z.object({
  videoId: z.string(),
  personaId: z.string(),
  channelId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId, personaId, channelId } = requestSchema.parse(body);
    const supabase = serviceClient;

    // Get video row (check runId first)
    const { data: video } = await supabase
      .from("videos")
      .select("apify_runid")
      .eq("video_id", videoId)
      .single();

    let runId = video?.apify_runid;

    // Start Apify run if not already started
    if (!runId) {
      runId = await startApifyRun(videoId);
      console.log("Started Apify run:", runId, ":video:", videoId);
      await supabase
        .from("videos")
        .update({
          apify_runid: runId,
          captions_status: "processing",
          processing_started_at: new Date().toISOString(),
        })
        .eq("video_id", videoId);
    }

    try {
      const captions = await fetchApifyResults(runId);

      if (captions.length > 0) {
        // create PeronaIndex in Pinecone
        await ensurePineconeIndex(channelId);
        // Store captions with persona_id and null embeddings
        const captionsToInsert = captions.map((caption) => ({
          video_id: videoId,
          persona_id: personaId,
          start_time: caption.start,
          duration: caption.duration,
          text: caption.text,
          embedding: false, // Store it as false embedding initially
        }));
        const { error: insertError } = await supabase
          .from("captions")
          .insert(captionsToInsert);

        if (insertError) {
          throw new Error(`Failed to insert captions: ${insertError.message}`);
        }

        // Update video status to 'extracted' (captions available but not embedded)
        await supabase
          .from("videos")
          .update({
            captions_status: "extracted",
            processing_completed_at: new Date().toISOString(),
          })
          .eq("video_id", videoId);

        return NextResponse.json({
          captionsExtracted: captions.length,
          success: true,
          message: `Extracted ${captions.length} captions. Ready for embedding.`,
        });
      }

      throw new Error("No captions available for this video");
    } catch (err) {
      console.error("Caption extraction error:", err);

      await supabase
        .from("videos")
        .update({
          captions_status: "failed",
          captions_error: err instanceof Error ? err.message : "Unknown error",
        })
        .eq("video_id", videoId);

      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Failed to extract captions",
          success: false,
        },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Invalid request or server error", success: false },
      { status: 500 }
    );
  }
}
