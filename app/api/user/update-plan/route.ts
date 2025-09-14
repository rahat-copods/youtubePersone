import { NextRequest, NextResponse } from 'next/server';
import { createClient, serviceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { PRICING_TIERS } from '@/lib/pricing';

const updatePlanSchema = z.object({
  planId: z.enum(['free', 'starter', 'pro']),
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
    const { planId } = updatePlanSchema.parse(body);

    // Validate plan exists
    if (!PRICING_TIERS[planId]) {
      return NextResponse.json(
        { error: 'Invalid plan ID' },
        { status: 400 }
      );
    }

    // Use service client to update user plan
    const { error: updateError } = await serviceClient
      .from('users')
      .update({ 
        plan: planId,
        plan_updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to update user plan:', updateError);
      return NextResponse.json(
        { error: 'Failed to update plan' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      plan: planId,
      message: `Successfully updated to ${PRICING_TIERS[planId].name} plan`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data' },
        { status: 400 }
      );
    }
    
    console.error('Update plan error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}