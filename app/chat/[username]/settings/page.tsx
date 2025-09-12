"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Settings,
  FolderSync as Sync,
  Play,
  Loader2,
  Video,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useAuth } from "@/components/providers/auth-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Persona {
  id: string;
  username: string;
  title: string;
  description: string;
  thumbnail_url: string;
  channel_id: string;
  video_count: number;
  discovery_status: string;
  continuation_token: string | null;
}

interface Video {
  id: string;
  video_id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  duration: string;
  published_at: string;
  view_count: number;
  captions_status: string;
  captions_error: string | null;
}

type SortBy = "newest" | "oldest";
type FilterBy = "all" | "processed" | "pending" | "failed";

export default function PersonaSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const username = params.username as string;

  const [persona, setPersona] = useState<Persona | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [processingCaptions, setProcessingCaptions] = useState<Set<string>>(
    new Set()
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [videosPerPage] = useState(20);
  const [hasMoreVideos, setHasMoreVideos] = useState(false);
  const [videoTitleSearch, setVideoTitleSearch] = useState("");
  const [videoIdFilter, setVideoIdFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [filterBy, setFilterBy] = useState<FilterBy>("all");
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [bulkProcessingCount, setBulkProcessingCount] = useState(0);
  const [bulkTotalCaptions, setBulkTotalCaptions] = useState(0);
  const [totalDiscoveredVideosInDb, setTotalDiscoveredVideosInDb] = useState(0);
  const [totalProcessedCaptionsInDb, setTotalProcessedCaptionsInDb] = useState(0);

  useEffect(() => {
    fetchPersonaAndVideos();
  }, [username]);

  const fetchPersonaAndVideos = async () => {
    const supabase = createClient();

    // Fetch persona
    const { data: personaData, error: personaError } = await supabase
      .from("personas")
      .select("*")
      .eq("username", username)
      .single();

    if (personaError || !personaData) {
      toast.error("Persona not found");
      router.push("/");
      return;
    }

    // Check if user owns this persona
    if (!user || personaData.user_id !== user.id) {
      toast.error("You do not have permission to manage this persona");
      router.push(`/chat/${username}`);
      return;
    }

    setPersona(personaData);

    // Fetch total video counts from database
    const { data: totalVideosData, error: totalVideosError } = await supabase
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("persona_id", personaData.id);

    if (!totalVideosError) {
      setTotalDiscoveredVideosInDb(totalVideosData?.length || 0);
    }

    // Fetch total processed captions count from database
    const { data: processedCaptionsData, error: processedCaptionsError } = await supabase
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("persona_id", personaData.id)
      .eq("captions_status", "completed");

    if (!processedCaptionsError) {
      setTotalProcessedCaptionsInDb(processedCaptionsData?.length || 0);
    }

    // Fetch videos with pagination and filters
    let query = supabase
      .from("videos")
      .select("*")
      .eq("persona_id", personaData.id);

    // Apply filters
    if (videoTitleSearch) {
      query = query.ilike("title", `%${videoTitleSearch}%`);
    }
    if (videoIdFilter) {
      query = query.eq("video_id", videoIdFilter);
    }

    // Apply pagination and sorting
    const { data: videosData, error: videosError } = await query
      .order("published_at", { ascending: sortBy === "oldest" })
      .range(
        (currentPage - 1) * videosPerPage,
        currentPage * videosPerPage - 1
      );

    if (!videosError && videosData) {
      if (currentPage === 1) {
        setVideos(videosData);
      } else {
        setVideos((prev) => [...prev, ...videosData]);
      }
      setHasMoreVideos(videosData.length === videosPerPage);
    }

    setLoading(false);
  };

  const loadMoreVideos = async () => {
    setCurrentPage((prev) => prev + 1);
  };

  const resetAndFetch = async () => {
    setCurrentPage(1);
    setVideos([]);
    await fetchPersonaAndVideos();
  };

  useEffect(() => {
    if (currentPage > 1) {
      fetchPersonaAndVideos();
    }
  }, [currentPage]);

  useEffect(() => {
    resetAndFetch();
  }, [videoTitleSearch, videoIdFilter, sortBy]);

  const discoverVideos = async () => {
    if (!persona) return;

    setDiscovering(true);
    try {
      console.log(persona);
      const response = await fetch("/api/jobs/video-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: persona.id,
          channelId: persona.channel_id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to discover videos");
      }

      const result = await response.json();
      toast.success(`Discovered ${result.videosProcessed} new videos`);

      // Refresh the data
      await fetchPersonaAndVideos();
    } catch (error) {
      toast.error("Failed to discover videos");
    } finally {
      setDiscovering(false);
    }
  };

  const extractCaptions = async (videoId: string) => {
    if (!persona) return;

    setProcessingCaptions((prev) => new Set(prev).add(videoId));
    try {
      const response = await fetch("/api/jobs/caption-extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          personaId: persona.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to extract captions");
      }

      const result = await response.json();
      if (result.success) {
        toast.success(
          result.message || `Extracted ${result.captionsExtracted} captions`
        );
      } else {
        toast.error(result.message || "No captions available");
      }

      // Refresh the data
      await fetchPersonaAndVideos();
    } catch (error) {
      toast.error("Failed to extract captions");
    } finally {
      setProcessingCaptions((prev) => {
        const newSet = new Set(prev);
        newSet.delete(videoId);
        return newSet;
      });
    }
  };

  const processEmbeddings = async (videoId?: string) => {
    if (!persona) return;

    const processingKey = videoId || "all";
    setProcessingCaptions((prev) => new Set(prev).add(processingKey));

    if (!videoId) {
      setBulkProcessingCount(0);
      setBulkTotalCaptions(0);
    }

    try {
      let totalProcessed = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch("/api/jobs/caption-embedding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            personaId: persona.id,
            channelId: persona.channel_id,
            ...(videoId && { videoId }),
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to process embeddings");
        }

        const result = await response.json();
        if (result.success) {
          totalProcessed += result.embeddingsProcessed;

          if (!videoId) {
            setBulkProcessingCount(totalProcessed);
            setBulkTotalCaptions((prev) => prev + result.totalCaptions);
          }

          // If we processed fewer than 100, we're done
          hasMore = result.totalCaptions >= 100;

          if (!hasMore) {
            toast.success(
              videoId
                ? `Processed ${totalProcessed} embeddings for video`
                : `Processed ${totalProcessed} embeddings total`
            );
          }
        } else {
          toast.error(result.message || "Failed to process embeddings");
          break;
        }
      }

      // Refresh the data
      await fetchPersonaAndVideos();
    } catch (error) {
      toast.error("Failed to process embeddings");
    } finally {
      setProcessingCaptions((prev) => {
        const newSet = new Set(prev);
        newSet.delete(processingKey);
        return newSet;
      });
    }
  };

  const filteredAndSortedVideos = videos
    .filter((video) => {
      switch (filterBy) {
        case "processed":
          return video.captions_status === "completed";
        case "pending":
          return (
            video.captions_status === "pending" ||
            video.captions_status === "extracted"
          );
        case "failed":
          return video.captions_status === "failed";
        default:
          return true;
      }
    })
    .sort((a, b) => {
      const dateA = new Date(a.published_at).getTime();
      const dateB = new Date(b.published_at).getTime();
      return sortBy === "newest" ? dateB - dateA : dateA - dateB;
    });

  const processedCount = videos.filter(
    (v) => v.captions_status === "completed"
  ).length;
  const progressPercentage =
    videos.length > 0 ? (processedCount / videos.length) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-teal-50">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-96 bg-gray-200 rounded" />
          </div>
        </main>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-teal-50">
        <Header />
        <main className="container mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Persona Not Found</h1>
          <p className="text-gray-600">
            The persona you're looking for doesn't exist or you don't have
            permission to manage it.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-teal-50">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/chat/${username}`}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to chat
          </Link>

          <div className="flex items-center gap-4 mb-6">
            <img
              src={persona.thumbnail_url}
              alt={persona.title}
              className="w-16 h-16 rounded-lg object-cover"
            />
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
                {persona.title} Settings
              </h1>
              <p className="text-gray-600">@{persona.username}</p>
            </div>
            {videos.some((v) => v.captions_status === "extracted") && (
              <Button
                onClick={() => processEmbeddings()}
                disabled={processingCaptions.has("all")}
                variant="outline"
              >
                {processingCaptions.has("all") ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing All... ({bulkProcessingCount}/{bulkTotalCaptions}
                    )
                  </>
                ) : (
                  <>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Process All Pending Captions
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Progress Overview */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Video Processing Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>
                  Videos Discovered: {totalDiscoveredVideosInDb} / {persona.video_count}
                </span>
                <span>
                  Captions Processed: {totalProcessedCaptionsInDb} / {totalDiscoveredVideosInDb}
                </span>
              </div>
              <Progress 
                value={totalDiscoveredVideosInDb > 0 ? (totalProcessedCaptionsInDb / totalDiscoveredVideosInDb) * 100 : 0} 
                className="w-full" 
              />
              <div className="flex gap-2">
                <Button
                  onClick={discoverVideos}
                  disabled={discovering}
                  variant="outline"
                >
                  {discovering ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Discovering...
                    </>
                  ) : (
                    <>
                      <Sync className="mr-2 h-4 w-4" />
                      Sync Videos
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Search by Title
                </label>
                <Input
                  placeholder="Enter video title..."
                  value={videoTitleSearch}
                  onChange={(e) => setVideoTitleSearch(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Video ID
                </Label>
                <Input
                  placeholder="Enter video ID..."
                  value={videoIdFilter}
                  onChange={(e) => setVideoIdFilter(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">
                  Sort by
                </label>
                <Select
                  value={sortBy}
                  onValueChange={(value: SortBy) => setSortBy(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">
                  Filter by
                </label>
                <Select
                  value={filterBy}
                  onValueChange={(value: FilterBy) => setFilterBy(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Videos</SelectItem>
                    <SelectItem value="processed">
                      Captions Processed
                    </SelectItem>
                    <SelectItem value="pending">Captions Pending</SelectItem>
                    <SelectItem value="failed">Captions Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Videos List */}
        <Card>
          <CardHeader>
            <CardTitle>Videos ({filteredAndSortedVideos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredAndSortedVideos.length === 0 ? (
              <div className="text-center py-8">
                <Video className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No videos found
                </h3>
                <p className="text-gray-600 mb-4">
                  {videos.length === 0
                    ? 'Click "Sync Videos" to discover videos from this channel.'
                    : "No videos match the current filter criteria."}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {filteredAndSortedVideos.map((video) => (
                    <div
                      key={video.id}
                      className="flex gap-4 p-4 border rounded-lg hover:bg-gray-50"
                    >
                      <img
                        src={video.thumbnail_url}
                        alt={video.title}
                        className="w-32 h-20 object-cover rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate mb-1">
                          {video.title}
                        </h4>
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                          {video.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>{video.duration}</span>
                          <span>{video.view_count.toLocaleString()} views</span>
                          <span>
                            {new Date(video.published_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge
                          variant={
                            video.captions_status === "completed"
                              ? "default"
                              : video.captions_status === "failed"
                              ? "destructive"
                              : video.captions_status === "extracted"
                              ? "secondary"
                              : video.captions_status === "processing"
                              ? "secondary"
                              : "secondary"
                          }
                        >
                          {video.captions_status === "completed"
                            ? "Processed"
                            : video.captions_status === "failed"
                            ? "Failed"
                            : video.captions_status === "extracted"
                            ? "Ready for Embedding"
                            : video.captions_status === "processing"
                            ? "Extracting..."
                            : "Pending"}
                        </Badge>
                        {video.captions_status === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => extractCaptions(video.video_id)}
                            disabled={processingCaptions.has(video.video_id)}
                          >
                            {processingCaptions.has(video.video_id) ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                Extracting...
                              </>
                            ) : (
                              <>
                                <Play className="mr-2 h-3 w-3" />
                                Extract Captions
                              </>
                            )}
                          </Button>
                        )}
                        {video.captions_status === "extracted" && (
                          <Button
                            size="sm"
                            onClick={() => processEmbeddings(video.video_id)}
                            disabled={processingCaptions.has(video.video_id)}
                          >
                            {processingCaptions.has(video.video_id) ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                Embedding...
                              </>
                            ) : (
                              <>
                                <MessageSquare className="mr-2 h-3 w-3" />
                                Process Embeddings
                              </>
                            )}
                          </Button>
                        )}
                        {video.captions_status === "failed" && (
                          <Button
                            size="sm"
                            onClick={() => extractCaptions(video.video_id)}
                            disabled={processingCaptions.has(video.video_id)}
                            variant="outline"
                          >
                            {processingCaptions.has(video.video_id) ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                Retrying...
                              </>
                            ) : (
                              <>
                                <Play className="mr-2 h-3 w-3" />
                                Retry
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {hasMoreVideos && (
                  <div className="text-center py-4">
                    <Button onClick={loadMoreVideos} variant="outline">
                      Load More Videos
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
