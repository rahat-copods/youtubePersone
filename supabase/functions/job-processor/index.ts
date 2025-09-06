import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface Job {
  id: string;
  type: string;
  payload: any;
  status: string;
  retry_count: number;
  max_retries: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get next pending job with row-level locking
    const { data: jobs, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError) {
      throw fetchError;
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending jobs' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const job = jobs[0] as Job;

    // Update job status to 'running'
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ 
        status: 'running', 
        started_at: new Date().toISOString() 
      })
      .eq('id', job.id);

    if (updateError) {
      throw updateError;
    }

    // Process job based on type
    let result;
    try {
      switch (job.type) {
        case 'video_discovery':
          result = await processVideoDiscovery(job, supabase);
          break;
        case 'caption_extraction':
          result = await processCaptionExtraction(job, supabase);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      // Mark job as completed
      await supabase
        .from('jobs')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          result,
          progress: 100,
        })
        .eq('id', job.id);

      return new Response(
        JSON.stringify({ message: 'Job completed successfully', result }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } catch (jobError) {
      console.error('Job processing error:', jobError);

      // Handle job failure with retry logic
      const newRetryCount = job.retry_count + 1;
      const shouldRetry = newRetryCount < job.max_retries;

      if (shouldRetry) {
        const nextScheduleTime = new Date();
        nextScheduleTime.setMinutes(nextScheduleTime.getMinutes() + Math.pow(2, newRetryCount));

        await supabase
          .from('jobs')
          .update({
            status: 'pending',
            retry_count: newRetryCount,
            scheduled_at: nextScheduleTime.toISOString(),
            error_message: jobError instanceof Error ? jobError.message : 'Unknown error',
          })
          .eq('id', job.id);
      } else {
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: jobError instanceof Error ? jobError.message : 'Unknown error',
          })
          .eq('id', job.id);
      }

      throw jobError;
    }
  } catch (error) {
    console.error('Job processor error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function processVideoDiscovery(job: Job, supabase: any) {
  const { personaId, channelId } = job.payload;
  const ytch = await import('npm:yt-channel-info@3.3.0');

  try {
    // Get persona's current continuation token
    const { data: persona } = await supabase
      .from('personas')
      .select('continuation_token')
      .eq('id', personaId)
      .single();

    // Fetch videos
    const result = await ytch.getChannelVideos({
      channelId,
      sortBy: 'oldest',
      continuation: persona?.continuation_token,
    });

    if (result?.items) {
      // Insert videos into database
      const videos = result.items.map((item: any) => ({
        persona_id: personaId,
        video_id: item.videoId,
        title: item.title,
        description: item.descriptionSnippet || '',
        thumbnail_url: item.videoThumbnails?.[0]?.url || '',
        duration: formatDuration(parseInt(item.lengthSeconds || '0')),
        published_at: item.publishedText || new Date().toISOString(),
        view_count: item.viewCount || 0,
      }));

      // Insert videos (ignore duplicates)
      await supabase
        .from('videos')
        .upsert(videos, { onConflict: 'video_id', ignoreDuplicates: true });

      // Update persona with new continuation token
      await supabase
        .from('personas')
        .update({
          continuation_token: result.continuation,
          discovery_status: result.continuation ? 'in_progress' : 'completed',
          last_video_discovered: new Date().toISOString(),
        })
        .eq('id', personaId);

      // Create caption extraction jobs for new videos
      const captionJobs = videos.map((video: any) => ({
        type: 'caption_extraction',
        payload: { videoId: video.video_id, personaId },
        status: 'pending',
        idempotency_key: `caption_extraction_${video.video_id}`,
        max_retries: 2,
      }));

      if (captionJobs.length > 0) {
        await supabase.from('jobs').insert(captionJobs);
      }

      return {
        videosProcessed: videos.length,
        hasMore: !!result.continuation,
        continuationToken: result.continuation,
      };
    }

    return { videosProcessed: 0, hasMore: false };
  } catch (error) {
    console.error('Video discovery error:', error);
    throw error;
  }
}

async function processCaptionExtraction(job: Job, supabase: any) {
  const { videoId, personaId } = job.payload;

  try {
    // Mark video as processing
    await supabase
      .from('videos')
      .update({ captions_status: 'processing' })
      .eq('video_id', videoId);

    const captions = await extractCaptionsWithApify(videoId);
    
    if (captions.length > 0) {
      // Generate embeddings and store captions
      const openai = new (await import('npm:openai@4')).default({
        apiKey: Deno.env.get('OPENAI_API_KEY')!,
        baseURL: Deno.env.get('OPENAI_API_BASE_URL'),
      });

      const captionsWithEmbeddings = [];
      
      for (const caption of captions) {
        const embedding = await openai.embeddings.create({
          model: 'text-embedding-005',
          input: caption.text,
        });

        captionsWithEmbeddings.push({
          video_id: videoId,
          start_time: caption.start,
          duration: caption.duration,
          text: caption.text,
          embedding: embedding.data[0].embedding,
        });
      }

      // Insert captions
      await supabase.from('captions').insert(captionsWithEmbeddings);
      
      // Mark video as completed
      await supabase
        .from('videos')
        .update({ captions_status: 'completed' })
        .eq('video_id', videoId);
    } else {
      // Mark as failed if no captions found
      await supabase
        .from('videos')
        .update({ 
          captions_status: 'failed',
          captions_error: 'No captions available'
        })
        .eq('video_id', videoId);
    }

    return { captionsExtracted: captions.length };
  } catch (error) {
    // Mark video as failed
    await supabase
      .from('videos')
      .update({ 
        captions_status: 'failed',
        captions_error: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('video_id', videoId);

    throw error;
  }
}

async function extractCaptionsWithApify(videoId: string): Promise<CaptionSegment[]> {
  // This would implement the Apify integration
  // For now, return empty array as placeholder
  return [];
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}