import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const createPersonaSchema = z.object({
  channelId: z.string(),
  username: z.string(),
  title: z.string(),
  description: z.string(),
  thumbnailUrl: z.string().url(),
  videoCount: z.number(),
  isPublic: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('personas')
      .select('*')
      .or(user ? `is_public.eq.true,user_id.eq.${user.id}` : 'is_public.eq.true')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createPersonaSchema.parse(body);

    // Check if persona already exists
    const { data: existingPersona } = await supabase
      .from('personas')
      .select('id')
      .eq('channel_id', validatedData.channelId)
      .eq('user_id', user.id)
      .single();

    if (existingPersona) {
      return NextResponse.json(
        { error: 'You already have a persona for this channel' },
        { status: 409 }
      );
    }

    // Create persona
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .insert({
        channel_id: validatedData.channelId,
        username: validatedData.username,
        title: validatedData.title,
        description: validatedData.description,
        thumbnail_url: validatedData.thumbnailUrl,
        video_count: validatedData.videoCount,
        user_id: user.id,
        is_public: validatedData.isPublic,
        discovery_status: 'pending',
      })
      .select()
      .single();

    if (personaError) {
      return NextResponse.json({ error: personaError.message }, { status: 500 });
    }

    // Create background job for video discovery
    const jobId = uuidv4();
    const { error: jobError } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        type: 'video_discovery',
        payload: {
          personaId: persona.id,
          channelId: validatedData.channelId,
        },
        status: 'pending',
        idempotency_key: `video_discovery_${persona.id}`,
        max_retries: 3,
      });

    if (jobError) {
      console.error('Failed to create video discovery job:', jobError);
    }

    return NextResponse.json(persona, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input data' }, { status: 400 });
    }
    console.error('Create persona error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}