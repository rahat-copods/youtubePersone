import { NextRequest } from "next/server";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { OpenAI } from "openai";
import { z } from "zod";
import { Pinecone } from "@pinecone-database/pinecone";

const requestSchema = z.object({
  personaId: z.string(),
  message: z.string(),
  userId: z.string(),
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
    const { personaId, message, userId, channelId } = requestSchema.parse(body);

    const supabase = serviceClient;

    // Get persona info
    const { data: persona, error: personaError } = await supabase
      .from("personas")
      .select("title, description, username")
      .eq("id", personaId)
      .single();

    if (personaError || !persona) {
      return new Response("Persona not found", { status: 404 });
    }

    // Perform vector search using Pinecone
    const queryEmbedding = await getEmbedding(message);
    const index = pinecone.index(channelId.toLowerCase());
    const searchResults = await index.query({
      vector: queryEmbedding,
      topK: 10,
      includeMetadata: true,
    });

    // Extract relevant context from Pinecone results
    const relevantContext =
      searchResults.matches
        ?.filter((match) => match.score && match.score > 0.5) // Filter by similarity threshold
        .map((match) => ({
          text: match.metadata?.text,
          video_id: match.metadata?.video_id,
          start: match.metadata?.start,
          video_title:
            match.metadata?.video_title || `Video ${match.metadata?.video_id}`,
          timestamp: match.metadata?.start_time || 0,
          confidence: match.score,
        })) || [];

    // If no good matches from Pinecone, get video titles from Supabase for context
    if (relevantContext.length > 0) {
      const videoIds = [...new Set(relevantContext.map((ctx) => ctx.video_id))];
      const { data: videos } = await supabase
        .from("videos")
        .select("video_id, title")
        .in("video_id", videoIds);
      // Update context with proper video titles
      relevantContext.forEach((ctx) => {
        const video = videos?.find((v) => v.video_id === ctx.video_id);
        if (video) {
          ctx.video_title = video.title;
        }
      });
    }

    // Create readable stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Generate AI response
          const systemPrompt = `You are ${
            persona.title
          }, an AI persona based on the YouTube channel @${persona.username}. 

Channel description: ${persona.description}

You have access to transcripts from your videos. Use this information to answer questions in your authentic voice and style. When referencing specific content, mention the video it came from.

Relevant video transcripts for this question:
${relevantContext
  .map(
    (ctx: any) =>
      `Video: "${ctx.video_title}" (${ctx.video_id}) at ${ctx.timestamp}\nContent: ${ctx.text}\n`
  )
  .join("\n")}

Respond as the channel creator would, using their knowledge, style, and perspective. If you reference specific videos, format them as [Video Title](video_id@timestamp).`;

          const response = await openai.chat.completions.create({
            model: "gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: message },
            ],
            stream: true,
            temperature: 0.7,
          });

          let accumulatedContent = "";
          const videoReferences: any[] = [];

          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              accumulatedContent += content;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "content", content })}\n\n`
                )
              );
            }
          }

          // Extract video references from relevant context
          const references = relevantContext.map((ctx: any) => ({
            video_id: ctx.video_id,
            title: ctx.video_title,
            timestamp: ctx.timestamp,
            confidence: 0.8, // Placeholder confidence score
          }));

          if (references.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "references",
                  references,
                })}\n\n`
              )
            );
          }
          // Save user message
          await supabase.from("messages").insert({
            persona_id: personaId,
            user_id: userId,
            role: "user",
            content: message,
          });
          // Save assistant message
          let messageId = null;
          if (userId) {
            const { data: savedMessage } = await supabase
              .from("messages")
              .insert({
                persona_id: personaId,
                user_id: userId,
                role: "assistant",
                content: accumulatedContent,
                video_references: references.length > 0 ? references : null,
              })
              .select("id")
              .single();

            messageId = savedMessage?.id;
          }

          // Send completion signal
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "complete",
                messageId,
              })}\n\n`
            )
          );

          controller.close();
        } catch (error) {
          console.error("Chat stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: "Failed to generate response",
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "gemini-embedding-001",
    input: text,
  });
  return response.data[0].embedding;
}
