import { CaptionSegment } from "@/types";

export function parseWebVTTForEmbeddings(
  webvttContent: string,
  chunkDuration = 40,
  overlapPercentage = 15
): CaptionSegment[] {
  // Helper function to convert timestamp to seconds
  function timestampToSeconds(timestamp: string) {
    const [time, milliseconds] = timestamp.split(".");
    const [hours, minutes, seconds] = time.split(":").map(Number);
    const ms = milliseconds ? parseInt(milliseconds) / 1000 : 0;
    return hours * 3600 + minutes * 60 + seconds + ms;
  }

  // Helper function to format seconds back to timestamp
  function secondsToTimestamp(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms
      .toString()
      .padStart(3, "0")}`;
  }

  // Parse WebVTT content
  const lines = webvttContent.split("\n");
  const captions = [];
  let currentCaption = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip header and empty lines
    if (
      !line ||
      line === "WEBVTT" ||
      line.startsWith("Kind:") ||
      line.startsWith("Language:")
    ) {
      continue;
    }

    // Check if line contains timestamp
    if (line.includes("-->")) {
      // Extract timestamps and alignment info
      const timestampMatch = line.match(
        /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/
      );
      if (timestampMatch) {
        currentCaption = {
          start: timestampToSeconds(timestampMatch[1]),
          end: timestampToSeconds(timestampMatch[2]),
          text: "",
        };
      }
    }
    // Check if line contains caption text
    else if (currentCaption && line && !line.match(/^\d+$/)) {
      // Remove timing tags like <00:00:00.880><c> and </c>
      let cleanText = line.replace(/<[\d:.]+>/g, "").replace(/<\/?c>/g, "");

      // If text already exists, add space before new text
      if (currentCaption.text) {
        currentCaption.text += " " + cleanText;
      } else {
        currentCaption.text = cleanText;
      }

      // Check if this is the end of current caption (next line is empty or timestamp)
      const nextLineIndex = i + 1;
      const nextLine =
        nextLineIndex < lines.length ? lines[nextLineIndex].trim() : "";

      if (!nextLine || nextLine.includes("-->") || nextLine.match(/^\d+$/)) {
        if (currentCaption.text.trim()) {
          captions.push({ ...currentCaption });
        }
        currentCaption = null;
      }
    }
  }

  // Create timeline of all text with timestamps
  const timeline: { time: number; text: string; type: string }[] = [];
  captions.forEach((caption) => {
    timeline.push({
      time: caption.start,
      text: caption.text.trim(),
      type: "start",
    });
  });

  // Sort by time
  timeline.sort((a, b) => a.time - b.time);

  // Create chunks with overlap
  const chunks: CaptionSegment[] = [];
  const overlapDuration = chunkDuration * (overlapPercentage / 100);

  if (timeline.length === 0) return chunks;

  let chunkStart = 0;
  let chunkIndex = 0;

  while (chunkStart < timeline[timeline.length - 1].time + 10) {
    // Add 10s buffer
    const chunkEnd = chunkStart + chunkDuration;

    // Find all timeline entries within this chunk
    const chunkEntries = timeline.filter(
      (entry) => entry.time >= chunkStart && entry.time < chunkEnd
    );

    // If no entries in this chunk and we have previous chunks, break
    if (chunkEntries.length === 0 && chunks.length > 0) {
      break;
    }

    // Combine text from all entries in this chunk
    let chunkText = chunkEntries.map((entry) => entry.text).join(" ");

    // Add overlap from previous chunk if not the first chunk
    if (chunkIndex > 0 && chunks.length > 0) {
      const overlapStart = chunkStart - overlapDuration;
      const overlapEntries = timeline.filter(
        (entry) => entry.time >= overlapStart && entry.time < chunkStart
      );

      if (overlapEntries.length > 0) {
        const overlapText = overlapEntries.map((entry) => entry.text).join(" ");
        chunkText = overlapText + " " + chunkText;
      }
    }

    // Only add chunk if it has content
    if (chunkText.trim()) {
      chunks.push({
        text: chunkText.trim(),
        duration: chunkDuration,
        start: Math.round(chunkStart),
      });
    }

    // Move to next chunk (accounting for overlap)
    chunkStart += chunkDuration - overlapDuration;
    chunkIndex++;

    // Safety break to avoid infinite loops
    if (chunkIndex > 1000) break;
  }

  return chunks;
}
