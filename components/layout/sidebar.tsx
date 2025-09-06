'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface ChatHistory {
  id: string;
  persona_username: string;
  persona_title: string;
  last_message: string;
  updated_at: string;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setChatHistory([]);
      setLoading(false);
      return;
    }

    const fetchChatHistory = async () => {
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('messages')
        .select(`
          persona_id,
          content,
          updated_at,
          personas!inner(username, title)
        `)
        .eq('user_id', user.id)
        .eq('role', 'user')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        const groupedHistory = data.reduce((acc: Record<string, ChatHistory>, message: any) => {
          const personaId = message.persona_id;
          if (!acc[personaId] || new Date(message.updated_at) > new Date(acc[personaId].updated_at)) {
            acc[personaId] = {
              id: personaId,
              persona_username: message.personas.username,
              persona_title: message.personas.title,
              last_message: message.content,
              updated_at: message.updated_at,
            };
          }
          return acc;
        }, {});

        setChatHistory(Object.values(groupedHistory));
      }
      setLoading(false);
    };

    fetchChatHistory();
  }, [user]);

  if (!user) return null;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <aside className={cn(
        "fixed top-16 left-0 h-[calc(100vh-4rem)] w-80 bg-white border-r transition-transform duration-300 z-50",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "lg:translate-x-0"
      )}>
        <div className="flex items-center justify-between p-4 border-b lg:hidden">
          <h2 className="font-semibold">Chat History</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="p-4">
          <Link href="/" onClick={onClose}>
            <Button className="w-full" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              New Chat
            </Button>
          </Link>
        </div>
        
        <Separator />
        
        <ScrollArea className="flex-1 px-4">
          {loading ? (
            <div className="py-4 text-center text-muted-foreground">
              Loading chat history...
            </div>
          ) : chatHistory.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No chat history yet</p>
              <p className="text-xs mt-1">Start a conversation with a persona</p>
            </div>
          ) : (
            <div className="space-y-2 py-4">
              {chatHistory.map((chat) => (
                <Link
                  key={chat.id}
                  href={`/chat/${chat.persona_username}`}
                  onClick={onClose}
                  className={cn(
                    "block p-3 rounded-lg hover:bg-gray-50 transition-colors",
                    pathname === `/chat/${chat.persona_username}` && "bg-purple-50 border border-purple-200"
                  )}
                >
                  <div className="font-medium text-sm truncate">{chat.persona_title}</div>
                  <div className="text-xs text-muted-foreground truncate mt-1">
                    {chat.last_message}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(chat.updated_at).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </aside>
    </>
  );
}