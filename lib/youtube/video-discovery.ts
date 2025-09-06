import { google } from "googleapis";

const apiKey = process.env.YOUTUBE_API_KEY as string;
const youtube = google.youtube({
  version: "v3",
  auth: apiKey,
});

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
  continuationToken?: string; // stores last publishedAt date
  hasMore: boolean;
}

// Step 1: Get the uploads playlist for a channel
async function getUploadsPlaylistId(channelId: string) {
  const res = await youtube.channels.list({
    part: ["contentDetails"],
    id: [channelId],
  });

  if (!res.data.items?.length) {
    throw new Error("Channel not found or no uploads playlist");
  }
  return res.data.items[0].contentDetails!.relatedPlaylists!.uploads!;
}

// Step 2: Fetch playlist page
async function getPlaylistPage(playlistId: string, pageToken?: string) {
  const res = await youtube.playlistItems.list({
    part: ["snippet", "contentDetails"],
    playlistId,
    maxResults: 50,
    pageToken: pageToken || undefined,
  });

  return {
    items: res.data.items || [],
    nextPageToken: res.data.nextPageToken || null,
  };
}

// Step 3: Get full details for videoIds
async function getVideoDetails(videoIds: string[]) {
  const res = await youtube.videos.list({
    part: ["snippet", "contentDetails", "statistics"],
    id: videoIds,
    maxResults: 50,
  });

  return res.data.items?.map((item) => {
    const { id, snippet, contentDetails, statistics } = item;
    return {
      videoId: id!,
      title: snippet?.title || "",
      description: snippet?.description || "",
      thumbnailUrl:
        snippet?.thumbnails?.high?.url ||
        snippet?.thumbnails?.default?.url ||
        "",
      publishedAt: snippet?.publishedAt || new Date().toISOString(),
      duration: contentDetails?.duration || "PT0M0S",
      viewCount: parseInt(statistics?.viewCount || "0"),
    };
  }) as VideoInfo[];
}

// Step 4: Main discover function
export async function discoverVideos(
  channelId: string,
  continuationToken?: string // we store last fetched publish date here
): Promise<DiscoveryResult> {
  const uploadsPlaylistId = await getUploadsPlaylistId(channelId);

  let pageToken: string | undefined = undefined;
  let allVideos: VideoInfo[] = [];
  let stopDate = continuationToken ? new Date(continuationToken) : null;
  let done = false;

  while (!done) {
    const { items, nextPageToken } = await getPlaylistPage(
      uploadsPlaylistId,
      pageToken
    );

    if (!items.length) break;

    const videoIds = items
      .map((i) => i.contentDetails?.videoId!)
      .filter(Boolean);
    const details = await getVideoDetails(videoIds);

    for (let v of details) {
      if (stopDate && new Date(v.publishedAt) <= stopDate) {
        done = true;
        break;
      }
      allVideos.push(v);
    }

    if (!nextPageToken) break;
    pageToken = nextPageToken;
  }

  // Reverse because API returns newest→oldest
  allVideos.reverse();

  const lastVideo =
    allVideos.length > 0 ? allVideos[allVideos.length - 1] : null;

  return {
    videos: allVideos,
    continuationToken: lastVideo ? lastVideo.publishedAt : continuationToken,
    hasMore: !!lastVideo,
  };
}
