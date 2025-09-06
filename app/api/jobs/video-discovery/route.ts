import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { discoverVideos } from '@/lib/youtube/video-discovery';
import { z } from 'zod';

const requestSchema = z.object({
  personaId: z.string(),
  channelId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { personaId, channelId } = requestSchema.parse(body);

    // Create service role client for database operations
    const supabase = createClient();

    // Get persona's current continuation token
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .select('continuation_token')
      .eq('id', personaId)
      .single();

    if (personaError) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
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
        captions_status: 'pending',
      }));

      // Use upsert to avoid duplicates
      const { error: insertError } = await supabase
        .from('videos')
        .upsert(videos, { 
          onConflict: 'video_id',
          ignoreDuplicates: true 
        });

      if (insertError) {
        console.error('Video insertion error:', insertError);
        return NextResponse.json({ error: 'Failed to save videos' }, { status: 500 });
      }

      // Update persona with new continuation token and status
      const { error: updateError } = await supabase
        .from('personas')
        .update({
          continuation_token: result.continuationToken,
          discovery_status: result.hasMore ? 'in_progress' : 'completed',
          last_video_discovered: new Date().toISOString(),
        })
        .eq('id', personaId);

      if (updateError) {
        console.error('Persona update error:', updateError);
      }

      // Create caption extraction jobs for new videos
      const captionJobs = videos.map((video) => ({
        id: crypto.randomUUID(),
        type: 'caption_extraction',
        payload: { 
          videoId: video.video_id, 
          personaId 
        },
        status: 'pending',
        idempotency_key: `caption_extraction_${video.video_id}`,
        max_retries: 2,
      }));

      if (captionJobs.length > 0) {
        // Use service role client for job insertion
        const serviceClient = createClient();
        const { error: jobError } = await serviceClient
          .from('jobs')
          .insert(captionJobs);

        if (jobError) {
          console.error('Caption job creation error:', jobError);
        }
      }
    }

    return NextResponse.json({
      videosProcessed: result.videos.length,
      hasMore: result.hasMore,
      continuationToken: result.continuationToken,
    });
  } catch (error) {
    console.error('Video discovery error:', error);
    return NextResponse.json(
      { error: 'Failed to discover videos' },
      { status: 500 }
    );
  }
}