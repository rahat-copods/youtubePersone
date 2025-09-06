import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Get the Next.js API base URL from environment or construct it
const getApiBaseUrl = () => {
  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000';
  return appUrl;
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
          result = await processVideoDiscovery(job);
          break;
        case 'caption_extraction':
          result = await processCaptionExtraction(job);
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

async function processVideoDiscovery(job: Job) {
  const { personaId, channelId } = job.payload;

  try {
    // Call the Next.js API for video discovery
    const apiUrl = `${getApiBaseUrl()}/api/jobs/video-discovery`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ personaId, channelId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Video discovery API failed: ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Video discovery error:', error);
    throw error;
  }
}

async function processCaptionExtraction(job: Job) {
  const { videoId, personaId } = job.payload;

  try {
    // Call the Next.js API for caption extraction
    const apiUrl = `${getApiBaseUrl()}/api/jobs/caption-extraction`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ videoId, personaId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Caption extraction API failed: ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Caption extraction error:', error);
    throw error;
  }
}
