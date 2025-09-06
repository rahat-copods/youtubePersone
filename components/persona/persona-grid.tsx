'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Video, Clock, MessageSquare, Settings } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';

interface Persona {
  id: string;
  user_id: string;
  username: string;
  title: string;
  description: string;
  thumbnail_url: string;
  video_count: number;
  discovery_status: string;
  created_at: string;
}

export function PersonaGrid() {
  const { user } = useAuth();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPersonas = async () => {
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .or(user ? `is_public.eq.true,user_id.eq.${user.id}` : 'is_public.eq.true')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setPersonas(data);
      }
      setLoading(false);
    };

    fetchPersonas();
  }, [user]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="overflow-hidden animate-pulse">
            <div className="aspect-video bg-gray-200" />
            <CardContent className="p-4">
              <div className="h-4 bg-gray-200 rounded mb-2" />
              <div className="h-3 bg-gray-200 rounded mb-4 w-3/4" />
              <div className="flex justify-between text-xs">
                <div className="h-3 bg-gray-200 rounded w-16" />
                <div className="h-3 bg-gray-200 rounded w-12" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (personas.length === 0) {
    return (
      <div className="text-center py-12">
        <Video className="mx-auto h-16 w-16 text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No personas yet</h3>
        <p className="text-gray-600 mb-6">Create your first persona to start chatting with AI representations of YouTube channels.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {personas.map((persona) => (
        <Card key={persona.id} className="overflow-hidden hover:shadow-lg transition-all duration-300 group">
          <div className="aspect-video relative overflow-hidden">
            <img
              src={persona.thumbnail_url}
              alt={persona.title}
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute top-2 right-2">
              <Badge 
                variant={persona.discovery_status === 'completed' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {persona.discovery_status === 'completed' ? 'Ready' : 'Processing'}
              </Badge>
            </div>
          </div>
          
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-1 truncate" title={persona.title}>
              {persona.title}
            </h3>
            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
              {persona.description}
            </p>
            
            <div className="flex justify-between items-center text-xs text-muted-foreground mb-4">
              <div className="flex items-center gap-1">
                <Video className="h-3 w-3" />
                <span>{persona.video_count}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Created {new Date(persona.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <Link href={`/chat/${persona.username}`}>
                <Button 
                  className="w-full" 
                  size="sm"
                  disabled={persona.discovery_status !== 'completed'}
                >
                  <MessageSquare className="mr-2 h-3 w-3" />
                  Chat
                </Button>
              </Link>
              
              {user && persona.user_id === user.id && (
                <Link href={`/chat/${persona.username}/settings`}>
                  <Button 
                    variant="outline"
                    className="w-full" 
                    size="sm"
                  >
                    <Settings className="mr-2 h-3 w-3" />
                    Settings
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}