import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import {
  startApifyRun,
  fetchApifyResults,
} from "@/lib/apify/caption-extraction";
import { z } from "zod";

const requestSchema = z.object({
  videoId: z.string(),
  personaId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId, personaId } = requestSchema.parse(body);
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
        // Check existing captions for this video
        const { data: existingCaptions, error: fetchError } = await supabase
          .from("captions")
          .select("*")
          .eq("video_id", videoId);
        if (fetchError) {
          console.error("Error fetching existing captions:", fetchError);
          throw new Error(
            `Failed to fetch existing captions: ${fetchError.message}`
          );
        }

        // Compare lengths - if they match, skip processing
        if (existingCaptions && existingCaptions.length === captions.length) {
          console.log("Captions already exist with same length, skipping...");
          throw new Error(`Failed to insert captions: Captions already exist`);
        }
        // If lengths don't match, delete existing captions and insert new ones
        if (existingCaptions && existingCaptions.length > 0) {
          const { error: deleteError } = await supabase
            .from("captions")
            .delete()
            .eq("video_id", videoId);

          if (deleteError) {
            console.error("Error deleting existing captions:", deleteError);
            throw new Error(
              `Failed to fetch existing captions: ${deleteError.message}`
            );
          }
        }
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
        const { data: updateData, error: updateError } = await supabase
          .from("videos")
          .update({
            captions_status: "extracted",
            updated_at: new Date().toISOString(),
          })
          .eq("video_id", videoId)
          .select();
        if (updateError) {
          console.error("Error updating video status:", updateError);
          throw new Error(
            `Failed to update video status: ${updateError.message}`
          );
        }

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
