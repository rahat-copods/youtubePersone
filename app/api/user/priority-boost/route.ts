import { NextRequest, NextResponse } from 'next/server';
import { createClient, serviceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const priorityBoostSchema = z.object({
  personaId: z.string(),
  testCode: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { personaId, testCode } = priorityBoostSchema.parse(body);

    // Validate test payment code
    if (testCode !== '000000000') {
      return NextResponse.json(
        { error: 'Invalid payment code. Use 000000000 for test payments.' },
        { status: 400 }
      );
    }

    // Verify user owns the persona
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .select('id, channel_id, title')
      .eq('id', personaId)
      .eq('user_id', user.id)
      .single();

    if (personaError || !persona) {
      return NextResponse.json(
        { error: 'Persona not found or access denied' },
        { status: 404 }
      );
    }

    // Create priority video discovery job
    const { error: jobError } = await serviceClient
      .from('jobs')
      .insert({
        type: 'video_discovery',
        payload: {
          personaId: persona.id,
          channelId: persona.channel_id,
        },
        idempotency_key: `priority-video-discovery-${persona.id}-${Date.now()}`,
        scheduled_at: new Date(0).toISOString(), // Unix epoch for highest priority
        max_retries: 3,
        status: 'pending',
      });

    if (jobError) {
      console.error('Failed to create priority job:', jobError);
      return NextResponse.json(
        { error: 'Failed to create priority job' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Priority boost activated for ${persona.title}. Videos will be processed with high priority.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data' },
        { status: 400 }
      );
    }
    
    console.error('Priority boost error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}