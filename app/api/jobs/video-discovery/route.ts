import { NextRequest, NextResponse } from "next/server";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { discoverVideos } from "@/lib/youtube/video-discovery";
import { z } from "zod";

const requestSchema = z.object({
  personaId: z.string(),
  channelId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { personaId, channelId } = requestSchema.parse(body);

    // Create service role client for database operations
    const supabase = serviceClient;

    // Get persona's current continuation token
    const { data: persona, error: personaError } = await supabase
      .from("personas")
      .select("continuation_token")
      .eq("id", personaId)
      .single();

    if (personaError) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    // Discover videos using the YouTube library
    const result = await discoverVideos(channelId, persona?.continuation_token);

    if (result.videos.length > 0) {
      // Insert videos into database
      const videos = result.videos.map((video) => ({
        persona_id: personaId,
        video_id: video.videoId,
        title: video.title,
        description: video.description,
        thumbnail_url: video.thumbnailUrl,
        duration: video.duration,
        published_at: video.publishedAt,
        view_count: video.viewCount,
        captions_status: "pending",
      }));

      // Use upsert to avoid duplicates
      const { data: insertedVideos, error: insertError } = await supabase
        .from("videos")
        .upsert(videos, {
          onConflict: "video_id",
          ignoreDuplicates: true,
        })
        .select("video_id");

      if (insertError) {
        console.error("Video insertion error:", insertError);
        return NextResponse.json(
          { error: "Failed to save videos" },
          { status: 500 }
        );
      }

      // Create caption extraction jobs for newly inserted videos
      if (insertedVideos && insertedVideos.length > 0) {
        const captionJobs = insertedVideos.map((video) => ({
          type: "caption_extraction",
          payload: {
            videoId: video.video_id,
            personaId: personaId,
          },
          idempotency_key: `caption_extraction-${video.video_id}`,
          scheduled_at: new Date().toISOString(),
          max_retries: 3,
        }));

        const { error: jobsError } = await supabase
          .from("jobs")
          .insert(captionJobs);

        if (jobsError) {
          console.error("Failed to create caption extraction jobs:", jobsError);
          // Don't fail the video discovery, just log the error
        }
      }

      // Update persona with new continuation token and status
      const { error: updateError } = await supabase
        .from("personas")
        .update({
          continuation_token: result.continuationToken,
          discovery_status: result.hasMore ? "in_progress" : "completed",
          last_video_discovered: new Date().toISOString(),
        })
        .eq("id", personaId);

      if (updateError) {
        console.error("Persona update error:", updateError);
      }
    }

    return NextResponse.json({
      videosProcessed: result.videos.length,
      hasMore: result.hasMore,
      continuationToken: result.continuationToken,
    });
  } catch (error) {
    console.error("Video discovery error:", error);
    return NextResponse.json(
      { error: "Failed to discover videos" },
      { status: 500 }
    );
  }
}
