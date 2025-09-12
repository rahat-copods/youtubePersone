"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, ExternalLink, User, Bot } from "lucide-react";
import { Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import toast from "react-hot-toast";

interface Persona {
  id: string;
  username: string;
  title: string;
  description: string;
  thumbnail_url: string;
  discovery_status: string;
  channel_id: string;
}

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  video_references?: VideoReference[];
  created_at?: string;
}

interface VideoReference {
  id: string;
  title: string;
  timestamp: number;
  confidence: number;
  text_preview: string;
}

interface ChatInterfaceProps {
  persona: Persona;
  chatSessionId?: string;
}

export function ChatInterface({ persona, chatSessionId }: ChatInterfaceProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [topK, setTopK] = useState(10);
  const [similarityFilter, setSimilarityFilter] = useState(0.5);
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | undefined>(chatSessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadChatHistory();
  }, [persona.id, user, chatSessionId]);

  // Storage Flow Verification:
  // ✅ loadChatHistory() only called on mount/dependency changes (persona.id, user, chatSessionId)
  // ✅ messages state updated immediately for user messages (line ~120)
  // ✅ messages state updated incrementally during streaming (line ~160+)
  // ✅ No database re-fetching during conversation - only state updates

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadChatHistory = async () => {
    if (!user || !chatSessionId) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_session_id", chatSessionId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Check if persona has any videos with completed captions
    const supabase = createClient();
    const { data: completedVideos } = await supabase
      .from("videos")
      .select("id")
      .eq("persona_id", persona.id)
      .eq("captions_status", "completed")
      .limit(1);

    if (!completedVideos || completedVideos.length === 0) {
      toast.error(
        "This persona needs videos with processed captions before you can chat. Please go to settings to process some videos."
      );
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setIsStreaming(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      console.log(persona);
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: persona.id,
          message: userMessage.content,
          channelId: persona.channel_id,
          userId: user?.id,
          topK,
          similarityFilter,
          chatSessionId: currentChatSessionId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      let assistantMessage: Message = {
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "content") {
                assistantMessage.content += data.content;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = { ...assistantMessage };
                  return newMessages;
                });
              } else if (data.type === "references") {
                assistantMessage.video_references = data.references;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = { ...assistantMessage };
                  return newMessages;
                });
              } else if (data.type === "complete") {
                assistantMessage.id = data.messageId;
                if (data.chatSessionId && !currentChatSessionId) {
                  setCurrentChatSessionId(data.chatSessionId);
                  // Update URL to include chat session ID
                  window.history.replaceState(null, '', `/chat/${persona.username}/${data.chatSessionId}`);
                }
                setMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = { ...assistantMessage };
                  return newMessages;
                });
              } else if (data.type === "error") {
                throw new Error(data.error);
              }
            } catch (parseError) {
              console.error("Error parsing SSE data:", parseError);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        toast.error("Request cancelled");
      } else {
        console.error("Chat error:", error);
        toast.error("Failed to get response");
        // Remove the assistant message if there was an error
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Persona Header */}
      <div className="border-b bg-white/80 backdrop-blur-md p-4">
        <div className="flex items-center gap-3">
          <img
            src={persona.thumbnail_url}
            alt={persona.title}
            className="w-10 h-10 rounded-lg object-cover"
          />
          <div>
            <h2 className="font-semibold">{persona.title}</h2>
            <p className="text-sm text-muted-foreground">@{persona.username}</p>
          </div>
          <div className="ml-auto">
            <Badge
              variant={
                persona.discovery_status === "completed"
                  ? "default"
                  : "secondary"
              }
            >
              {persona.discovery_status === "completed"
                ? "Ready"
                : "Processing"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-purple-100 to-teal-100 flex items-center justify-center">
                <Bot className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Start a conversation
              </h3>
              <p className="text-muted-foreground">
                Ask me anything about {persona.title}'s content!
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex gap-3 max-w-[80%] ${
                    message.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.role === "user"
                        ? "bg-purple-100 text-purple-600"
                        : "bg-teal-100 text-teal-600"
                    }`}
                  >
                    {message.role === "user" ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>

                  <div
                    className={`space-y-2 ${
                      message.role === "user" ? "text-right" : "text-left"
                    }`}
                  >
                    <Card
                      className={
                        message.role === "user"
                          ? "bg-purple-50 border-purple-200"
                          : "bg-white"
                      }
                    >
                      <CardContent className="p-3">
                        <div className="prose prose-sm max-w-none">
                          {message.content.split("\n").map((line, i) => (
                            <p key={i} className="mb-2 last:mb-0">
                              {line}
                            </p>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {message.video_references &&
                      message.video_references.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Referenced videos:
                          </p>
                          {message.video_references.map((ref, refIndex) => (
                            <Card
                              key={refIndex}
                              className="bg-gray-50 border-gray-200"
                            >
                              <CardContent className="p-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">
                                      {ref.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Timestamp:{" "}
                                      {(ref.timestamp / 60).toFixed(2)}m
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="ml-2 h-6 w-6 p-0"
                                    onClick={() =>
                                      window.open(
                                        `https://youtube.com/watch?v=${ref.id}&t=${ref.timestamp}`,
                                        "_blank"
                                      )
                                    }
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                  </div>
                </div>
              </div>
            ))
          )}

          {isStreaming && (
            <div className="flex gap-3 justify-start">
              <div className="flex gap-3 max-w-[80%]">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-teal-100 text-teal-600">
                  <Bot className="w-4 h-4" />
                </div>
                <Card className="bg-white">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">
                        Thinking...
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t bg-white/80 backdrop-blur-md p-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" type="button">
                  <Settings className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Top K Results: {topK}
                    </label>
                    <Slider
                      value={[topK]}
                      onValueChange={(value) => setTopK(value[0])}
                      max={20}
                      min={1}
                      step={1}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Similarity Filter: {similarityFilter.toFixed(2)}
                    </label>
                    <Slider
                      value={[similarityFilter]}
                      onValueChange={(value) => setSimilarityFilter(value[0])}
                      max={1}
                      min={0.1}
                      step={0.05}
                      className="w-full"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                persona.discovery_status === "completed"
                  ? `Ask ${persona.title} anything...`
                  : "Persona is still processing..."
              }
              disabled={isLoading}
              className="flex-1"
            />
            {isStreaming ? (
              <Button type="button" onClick={stopGeneration} variant="outline">
                Stop
              </Button>
            ) : (
              <Button type="submit" disabled={isLoading || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
