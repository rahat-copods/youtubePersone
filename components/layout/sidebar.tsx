'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, Plus, X, Edit2, Check, X as XIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface ChatSession {
  id: string;
  persona_id: string;
  persona_username: string;
  persona_title: string;
  title: string;
  updated_at: string;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    if (!user) {
      setChatSessions([]);
      setLoading(false);
      return;
    }

    const fetchChatSessions = async () => {
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('chat_sessions')
        .select(`
          id,
          persona_id,
          title,
          updated_at,
          personas!inner(username, title)
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (!error && data) {
        const sessions = data.map((session: any) => ({
          id: session.id,
          persona_id: session.persona_id,
          persona_username: session.personas.username,
          persona_title: session.personas.title,
          title: session.title,
          updated_at: session.updated_at,
        }));
        
        setChatSessions(sessions);
      }
      setLoading(false);
    };

    fetchChatSessions();
  }, [user]);

  const startEditing = (sessionId: string, currentTitle: string) => {
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
  };

  const cancelEditing = () => {
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const saveTitle = async (sessionId: string) => {
    if (!editingTitle.trim()) {
      toast.error('Title cannot be empty');
      return;
    }

    try {
      const response = await fetch(`/api/chat-sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingTitle.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to update title');
      }

      // Update local state
      setChatSessions(prev => 
        prev.map(session => 
          session.id === sessionId 
            ? { ...session, title: editingTitle.trim() }
            : session
        )
      );

      setEditingSessionId(null);
      setEditingTitle('');
      toast.success('Title updated successfully');
    } catch (error) {
      toast.error('Failed to update title');
    }
  };
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
              Loading chat sessions...
            </div>
          ) : chatSessions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No chat sessions yet</p>
              <p className="text-xs mt-1">Start a conversation with a persona</p>
            </div>
          ) : (
            <div className="space-y-2 py-4">
              {chatSessions.map((session) => (
                <div
                  key={session.id}
                  className="group relative"
                >
                  <Link
                    href={`/chat/${session.persona_username}/${session.id}`}
                    onClick={onClose}
                    className={cn(
                      "block p-3 rounded-lg hover:bg-gray-50 transition-colors",
                      pathname.includes(`/chat/${session.persona_username}/${session.id}`) && "bg-purple-50 border border-purple-200"
                    )}
                  >
                    <div className="font-medium text-sm truncate">{session.persona_title}</div>
                    <div className="text-xs text-muted-foreground mt-1 pr-8">
                      {editingSessionId === session.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                          <Input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            className="h-6 text-xs"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                saveTitle(session.id);
                              } else if (e.key === 'Escape') {
                                cancelEditing();
                              }
                            }}
                            onBlur={() => saveTitle(session.id)}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => saveTitle(session.id)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={cancelEditing}
                          >
                            <XIcon className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="truncate">{session.title}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(session.updated_at).toLocaleDateString()}
                    </div>
                  </Link>
                  
                  {editingSessionId !== session.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.preventDefault();
                        startEditing(session.id, session.title);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </aside>
    </>
  );
}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(session.updated_at).toLocaleDateString()}
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