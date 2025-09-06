import ytch from 'yt-channel-info';

export interface VideoInfo {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  duration: string;
  publishedAt: string;
  viewCount: number;
}

export interface DiscoveryResult {
  videos: VideoInfo[];
  continuationToken?: string;
  hasMore: boolean;
}

export async function discoverVideos(
  channelId: string, 
  continuationToken?: string
): Promise<DiscoveryResult> {
  try {
    const payload={
      channelId,
      sortBy: "oldest" as "oldest",
      continuation: continuationToken,
    }
    const result = await ytch.getChannelVideos(payload);

    if (!result || !result.items) {
      return { videos: [], hasMore: false };
    }

    const videos: VideoInfo[] = result.items.map((item: any) => {
      // Handle different thumbnail formats
      let thumbnailUrl = '';
      if (item.videoThumbnails && item.videoThumbnails.length > 0) {
        thumbnailUrl = item.videoThumbnails[0].url;
      } else if (item.thumbnail) {
        thumbnailUrl = item.thumbnail;
      }

      // Handle published date
      let publishedAt = new Date().toISOString();
      if (item.publishedText) {
        // Try to parse relative time like "2 days ago"
        publishedAt = parseRelativeTime(item.publishedText);
      } else if (item.published) {
        publishedAt = new Date(item.published * 1000).toISOString();
      }

      return {
        videoId: item.videoId || item.id,
        title: item.title || '',
        description: item.descriptionSnippet || item.description || '',
        thumbnailUrl,
        duration: item.lengthSeconds ? formatDuration(parseInt(item.lengthSeconds)) : (item.duration || '0:00'),
        publishedAt,
        viewCount: parseInt(item.viewCount) || 0,
      };
    });

    return {
      videos,
      continuationToken: result.continuation as string|undefined,
      hasMore: !!result.continuation,
    };
  } catch (error) {
    console.error('Video discovery error:', error);
    throw new Error('Failed to discover videos');
  }
}

function parseRelativeTime(relativeTime: string): string {
  const now = new Date();
  const timeRegex = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i;
  const match = relativeTime.match(timeRegex);
  
  if (!match) {
    return now.toISOString();
  }
  
  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  switch (unit) {
    case 'second':
      now.setSeconds(now.getSeconds() - amount);
      break;
    case 'minute':
      now.setMinutes(now.getMinutes() - amount);
      break;
    case 'hour':
      now.setHours(now.getHours() - amount);
      break;
    case 'day':
      now.setDate(now.getDate() - amount);
      break;
    case 'week':
      now.setDate(now.getDate() - (amount * 7));
      break;
    case 'month':
      now.setMonth(now.getMonth() - amount);
      break;
    case 'year':
      now.setFullYear(now.getFullYear() - amount);
      break;
  }
  
  return now.toISOString();
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