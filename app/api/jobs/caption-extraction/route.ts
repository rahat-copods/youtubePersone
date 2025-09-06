import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  startApifyRun,
  fetchApifyResults,
} from "@/lib/apify/caption-extraction";
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
        .update({ apify_runid: runId, captions_status: "processing" })
        .eq("video_id", videoId);
    }

    try {
      const captions = await fetchApifyResults(runId);

      if (captions.length > 0) {
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
          } catch (e) {
            console.error("Embedding error:", e);
          }
        }

        if (captionsWithEmbeddings.length > 0) {
          await supabase.from("captions").insert(captionsWithEmbeddings);
        }

        await supabase
          .from("videos")
          .update({ captions_status: "completed" })
          .eq("video_id", videoId);

        return NextResponse.json({
          captionsExtracted: captionsWithEmbeddings.length,
          success: true,
        });
      }

      throw new Error("No captions available");
    } catch (err) {
      await supabase
        .from("videos")
        .update({
          captions_status: "failed",
          captions_error: err instanceof Error ? err.message : "Unknown error",
        })
        .eq("video_id", videoId);

      return NextResponse.json(
        { error: "Failed to extract captions" },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Invalid request or server error" },
      { status: 500 }
    );
  }
}
