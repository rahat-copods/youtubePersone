const ytch = require('yt-channel-info');

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
    const result = await ytch.getChannelVideos({
      channelId,
      sortBy: 'newest',
      continuation: continuationToken,
    });

    if (!result || !result.items) {
      return { videos: [], hasMore: false };
    }

    const videos: VideoInfo[] = result.items.map((item: any) => ({
      videoId: item.videoId,
      title: item.title,
      description: item.descriptionSnippet || '',
      thumbnailUrl: item.videoThumbnails?.[0]?.url || '',
      duration: item.lengthSeconds ? formatDuration(parseInt(item.lengthSeconds)) : '0:00',
      publishedAt: item.publishedText || new Date().toISOString(),
      viewCount: item.viewCount || 0,
    }));

    return {
      videos,
      continuationToken: result.continuation,
      hasMore: !!result.continuation,
    };
  } catch (error) {
    console.error('Video discovery error:', error);
    throw new Error('Failed to discover videos');
  }
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