'use client';

interface Persona {
  id: string;
  username: string;
  title: string;
  description: string;
  thumbnail_url: string;
  discovery_status: string;
}

interface ChatInterfaceProps {
  persona: Persona;
}

// This is now handled directly in the page component for better integration
export function ChatInterface({ persona }: ChatInterfaceProps) {
  return null; // Component logic moved to page level
}