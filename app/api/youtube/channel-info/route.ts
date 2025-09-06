import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { z } from 'zod';

const requestSchema = z.object({
  channelInput: z.string().min(1),
});

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelInput } = requestSchema.parse(body);

    let channelId = '';
    let username = '';

    // Extract channel ID or username from various YouTube URL formats
    if (channelInput.includes('youtube.com') || channelInput.includes('youtu.be')) {
      const urlPatterns = [
        { pattern: /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/, type: 'id' },
        { pattern: /youtube\.com\/c\/([a-zA-Z0-9_-]+)/, type: 'username' },
        { pattern: /youtube\.com\/user\/([a-zA-Z0-9_-]+)/, type: 'username' },
        { pattern: /youtube\.com\/@([a-zA-Z0-9_-]+)/, type: 'username' },
      ];

      for (const { pattern, type } of urlPatterns) {
        const match = channelInput.match(pattern);
        if (match) {
          if (type === 'id') {
            channelId = match[1];
          } else {
            username = match[1];
          }
          break;
        }
      }
    } else if (channelInput.startsWith('@')) {
      username = channelInput.slice(1);
    } else if (channelInput.startsWith('UC') && channelInput.length === 24) {
      // Looks like a channel ID
      channelId = channelInput;
    } else {
      // Assume it's a username
      username = channelInput;
    }

    // Search for channel using appropriate method
    let searchParams: any = {
      part: ['snippet', 'statistics', 'brandingSettings'],
      maxResults: 1,
    };

    if (channelId) {
      searchParams.id = [channelId];
    } else if (username) {
      searchParams.forHandle = username.startsWith('@') ? username : `@${username}`;
    }

    const response = await youtube.channels.list(searchParams);

    if (!response.data.items || response.data.items.length === 0) {
      return NextResponse.json(
        { error: 'Channel not found. Please check the channel ID or username.' },
        { status: 404 }
      );
    }

    const channel = response.data.items[0];
    const snippet = channel.snippet!;
    const statistics = channel.statistics!;

    // Extract username from customUrl or generate from title
    const extractedUsername = snippet.customUrl 
      ? snippet.customUrl.replace('@', '')
      : snippet.title!.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    // Format the response
    const responseData = {
      channelId: channel.id!,
      title: snippet.title!,
      description: snippet.description || '',
      thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
      videoCount: parseInt(statistics.videoCount || '0'),
      username: extractedUsername,
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Channel info error:', error);
    
    if (error instanceof Error && error.message.includes('quota')) {
      return NextResponse.json(
        { error: 'YouTube API quota exceeded. Please try again later.' },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch channel information' },
      { status: 500 }
    );
  }
}