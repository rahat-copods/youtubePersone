import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { ensurePineconeIndex } from "@/lib/pinecone/createIndex";
import { getPlanLimits } from "@/lib/pricing";

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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("personas")
      .select("*")
      .or(
        user ? `is_public.eq.true,user_id.eq.${user.id}` : "is_public.eq.true"
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get user's current plan
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('plan')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Failed to fetch user plan:', userError);
      return NextResponse.json(
        { error: 'Failed to verify user plan' },
        { status: 500 }
      );
    }

    const userPlan = userData?.plan || 'free';
    const planLimits = getPlanLimits(userPlan);

    // Check if user can create personas
    if (planLimits.maxPersonas === 0) {
      return NextResponse.json(
        { error: 'Upgrade to a paid plan to create personas' },
        { status: 403 }
      );
    }

    // Count existing personas
    const { data: existingPersonas, error: countError } = await supabase
      .from('personas')
      .select('id, is_public')
      .eq('user_id', user.id);

    if (countError) {
      console.error('Failed to count existing personas:', countError);
      return NextResponse.json(
        { error: 'Failed to verify persona limits' },
        { status: 500 }
      );
    }

    const totalPersonas = existingPersonas?.length || 0;
    const privatePersonas = existingPersonas?.filter(p => !p.is_public).length || 0;

    // Check total persona limit
    if (totalPersonas >= planLimits.maxPersonas) {
      return NextResponse.json(
        { error: `You've reached your limit of ${planLimits.maxPersonas} personas. Upgrade your plan to create more.` },
        { status: 403 }
      );
    }

    // Ensure user exists in public.users table
    // const { error: userUpsertError } = await supabase
    //   .from('users')
    //   .upsert({
    //     id: user.id,
    //     email: user.email || '',
    //     updated_at: new Date().toISOString(),
    //   }, {
    //     onConflict: 'id'
    //   });

    // if (userUpsertError) {
    //   console.error('Failed to upsert user:', userUpsertError);
    //   return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 });
    // }

    const body = await request.json();
    const validatedData = createPersonaSchema.parse(body);

    // Check private persona limit
    if (!validatedData.isPublic && privatePersonas >= planLimits.maxPrivatePersonas) {
      return NextResponse.json(
        { error: `You've reached your limit of ${planLimits.maxPrivatePersonas} private personas. Upgrade your plan or make this persona public.` },
        { status: 403 }
      );
    }

    // Check if persona already exists
    const { data: existingPersona } = await supabase
      .from("personas")
      .select("id")
      .eq("channel_id", validatedData.channelId)
      .eq("user_id", user.id)
      .single();

    if (existingPersona) {
      return NextResponse.json(
        { error: "Persona already exists for this channel" },
        { status: 409 }
      );
    }

    // Create persona
    const { data: persona, error: personaError } = await supabase
      .from("personas")
      .insert({
        channel_id: validatedData.channelId,
        username: validatedData.username,
        title: validatedData.title,
        description: validatedData.description,
        thumbnail_url: validatedData.thumbnailUrl,
        video_count: validatedData.videoCount,
        user_id: user.id,
        is_public: validatedData.isPublic,
        discovery_status: "pending",
      })
      .select()
      .single();

    if (personaError) {
      return NextResponse.json(
        { error: personaError.message },
        { status: 500 }
      );
    }
    // create PeronaIndex in Pinecone
    await ensurePineconeIndex(persona.channel_id);
    return NextResponse.json(
      {
        ...persona,
        redirectTo: `/chat/${persona.username}/settings`,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input data" },
        { status: 400 }
      );
    }
    console.error("Create persona error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
