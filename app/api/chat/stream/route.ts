import { NextRequest } from "next/server";
import { createClient, serviceClient } from "@/lib/supabase/server";
import { OpenAI } from "openai";
import { z } from "zod";
import { Pinecone } from "@pinecone-database/pinecone";
import { zodResponseFormat } from "openai/helpers/zod";

const requestSchema = z.object({
  personaId: z.string(),
  message: z.string(),
  userId: z.string(),
  channelId: z.string(),
  topK: z.number().optional().default(10),
  similarityFilter: z.number().optional().default(0.5),
  chatSessionId: z.string().optional(),
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
    const { personaId, message, userId, channelId, topK, similarityFilter, chatSessionId } = requestSchema.parse(body);

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
      topK: topK,
      includeMetadata: true,
    });

    // Extract relevant context from Pinecone results
    const relevantContext =
      searchResults.matches
        ?.filter((match) => match.score && match.score > similarityFilter) // Filter by similarity threshold
        .map((match) => ({
          text: match.metadata?.text,
          video_id: match.metadata?.video_id,
          start: match.metadata?.start,
          video_title:
            match.metadata?.video_title || `Video ${match.metadata?.video_id}`,
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
      `Video: "${ctx.video_title}" (${ctx.video_id}) at ${ctx.start}\nContent: ${ctx.text}\n`
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
          // Use AI to extract references from the response and available context
          let references: any[] = [];
          if (relevantContext.length > 0 && accumulatedContent.trim()) {
            references = await extractReferencesWithAI(
              accumulatedContent,
              relevantContext,
              message
            );
          }

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
          
          // Handle chat session
          let sessionId = chatSessionId;
          if (!sessionId && userId) {
            // Create new chat session
            const sessionTitle = message.length > 50 
              ? `${message.substring(0, 50)}...` 
              : message;
              
            const { data: newSession } = await supabase
              .from("chat_sessions")
              .insert({
                persona_id: personaId,
                user_id: userId,
                title: sessionTitle,
              })
              .select("id")
              .single();
            
            sessionId = newSession?.id;
          }

          // Save user message
          // Storage Flow: User message saved to DB before streaming begins
          const userMessageData: any = {
            persona_id: personaId,
            role: "user",
            content: message,
          };
          
          if (userId) userMessageData.user_id = userId;
          if (sessionId) userMessageData.chat_session_id = sessionId;
          
          await supabase.from("messages").insert(userMessageData);
          
          // Storage Flow: Assistant message saved to DB after streaming completes
          let messageId = null;
          if (userId) {
            const assistantMessageData: any = {
              persona_id: personaId,
              user_id: userId,
              role: "assistant",
              content: accumulatedContent,
              video_references: references.length > 0 ? references : null,
            };
            
            if (sessionId) assistantMessageData.chat_session_id = sessionId;
            
            const { data: savedMessage } = await supabase
              .from("messages")
              .insert(assistantMessageData)
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
                chatSessionId: sessionId,
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

async function extractReferencesWithAI(
  aiResponse: string,
  availableContext: any[],
  originalQuestion: string
): Promise<any[]> {
  const VideoReferenceSchema = z.object({
    video_id: z.string().min(1, "Video ID cannot be empty"),
    timestamp: z.number().nonnegative("Timestamp must be non-negative"),
    confidence: z.number().min(0).max(1, "Confidence must be between 0 and 1"),
  });

  // Schema for an array of references
  const VideoReferencesSchema = z.object({
    references: z.array(VideoReferenceSchema),
  });
  try {
    const contextSummary = availableContext
      .map(
        (ctx, index) =>
          `${index + 1}. Video: "${ctx.video_title}" (ID: ${ctx.video_id}) at ${
            ctx.start
          }s\n   Content: ${ctx.text.substring(0, 200)}...`
      )
      .join("\n");
    const referencesPrompt = `Given the AI response and available video context, identify which videos were actually referenced or would be most relevant to cite.

AI Response:
"${aiResponse}"

Original Question: "${originalQuestion}"

Available Video Context:
${contextSummary}

Instructions:
1. Analyze which videos from the available context were actually referenced or implied in the AI response
2. Consider which videos are most relevant to the user's question
3. Rank them by relevance (max 3-5 references)
4. Add accurate timestamps and confidence scores (0-1) for each reference 
5. Return ONLY a JSON array with this exact structure:

[
  {
    "video_id": "video_id_here",
    "timestamp": timestamp_number,
    "confidence": confidence_score_0_to_1,
  }
]

Return only the JSON array, no other text.`;

    const referencesResponse = await openai.chat.completions.create({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: referencesPrompt }],
      temperature: 0.3,
      response_format: zodResponseFormat(
        VideoReferencesSchema,
        "video_reference"
      ),
    });

    const referencesText = referencesResponse.choices[0]?.message?.content;
    if (!referencesText) {
      return [];
    }
    // Parse the JSON response
    const parsedResponse = JSON.parse(referencesText);
    const references = parsedResponse.references || parsedResponse;
    // Create a lookup map for available context by video_id
    const contextMap = new Map();
    availableContext.forEach((ctx) => {
      if (!contextMap.has(ctx.video_id)) {
        contextMap.set(ctx.video_id, []);
      }
      contextMap.get(ctx.video_id).push(ctx);
    });

    // Validate and enrich references
    const validatedReferences = JSON.parse(references)
      .filter((ref: any) => {
        // Check if video_id exists in available context
        const isValidId = contextMap.has(ref.video_id);
        if (!isValidId) {
          console.warn(
            `Video ID ${ref.video_id} not found in available context`
          );
        }
        return isValidId;
      })
      .map((ref: any) => {
        // Get the context for this video_id
        const videoContexts = contextMap.get(ref.video_id);

        // Find the context entry that matches or is closest to the timestamp
        let matchingContext = videoContexts[0]; // Default to first entry

        if (ref.timestamp && videoContexts.length > 1) {
          // Find the context entry with the closest timestamp
          matchingContext = videoContexts.reduce(
            (closest: any, current: any) => {
              const closestDiff = Math.abs(closest.timestamp - ref.timestamp);
              const currentDiff = Math.abs(current.timestamp - ref.timestamp);
              return currentDiff < closestDiff ? current : closest;
            }
          );
        }

        return {
          id: ref.video_id,
          title: matchingContext.video_title,
          timestamp: ref.timestamp,
          confidence: ref.confidence,
          // Optional: add more context information
          text_preview: matchingContext.text?.substring(0, 50) + "..." || "",
        };
      });

    // return JSON.parse(referencesText);
    console.log(
      `Validated ${validatedReferences.length} out of ${
        JSON.parse(references).length
      } references`
    );
    return validatedReferences;
  } catch (error) {
    console.error("Error extracting references with AI:", error);
    return [];
  }
}