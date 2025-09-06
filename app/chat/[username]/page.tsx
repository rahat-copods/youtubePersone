'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { ChatInterface } from '@/components/chat/chat-interface';
import { Button } from '@/components/ui/button';
import { Menu, Settings } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import Link from 'next/link';

interface Persona {
  id: string;
  user_id: string;
  username: string;
  title: string;
  description: string;
  thumbnail_url: string;
  discovery_status: string;
}

export default function ChatPage() {
  const params = useParams();
  const { user } = useAuth();
  const username = params.username as string;
  const [persona, setPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchPersona = async () => {
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('personas')
        .select('id, user_id, username, title, description, thumbnail_url, discovery_status')
        .eq('username', username)
        .single();

      if (!error && data) {
        setPersona(data);
      }
      setLoading(false);
    };

    fetchPersona();
  }, [username]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-teal-50">
        <Header />
        <main className="lg:pl-80">
          <div className="container mx-auto px-4 py-8">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-96 bg-gray-200 rounded" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-teal-50">
        <Header />
        <main className="lg:pl-80">
          <div className="container mx-auto px-4 py-8 text-center">
            <h1 className="text-2xl font-bold mb-4">Persona Not Found</h1>
            <p className="text-gray-600">The persona you're looking for doesn't exist or isn't accessible.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-teal-50">
      <Header />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <main className="lg:pl-80 transition-all duration-300">
        {/* Mobile menu button */}
        <div className="lg:hidden p-4 border-b bg-white/80 backdrop-blur-md flex justify-between items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4 mr-2" />
            Chat History
          </Button>
          
          {user && persona && persona.user_id === user.id && (
            <Link href={`/chat/${username}/settings`}>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </Link>
          )}
        </div>

        {/* Desktop settings button */}
        {user && persona && persona.user_id === user.id && (
          <div className="hidden lg:block absolute top-4 right-4 z-10">
            <Link href={`/chat/${username}/settings`}>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </Link>
          </div>
        )}

        <ChatInterface persona={persona} />
      </main>
    </div>
  );
}