'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2, Youtube } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface ChannelPreview {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoCount: number;
  username: string;
}

export function AddPersonaDialog() {
  const { user, userPlan, planInfo } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [preview, setPreview] = useState<ChannelPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [personaCount, setPersonaCount] = useState(0);
  const [privatePersonaCount, setPrivatePersonaCount] = useState(0);

  // Fetch user's current persona counts
  useEffect(() => {
    if (user && isOpen) {
      fetchPersonaCounts();
    }
  }, [user, isOpen]);

  const fetchPersonaCounts = async () => {
    try {
      const response = await fetch('/api/personas');
      if (response.ok) {
        const personas = await response.json();
        const userPersonas = personas.filter((p: any) => p.user_id === user?.id);
        setPersonaCount(userPersonas.length);
        setPrivatePersonaCount(userPersonas.filter((p: any) => !p.is_public).length);
      }
    } catch (error) {
      console.error('Failed to fetch persona counts:', error);
    }
  };

  const fetchChannelInfo = async () => {
    if (!channelInput.trim()) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/youtube/channel-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelInput: channelInput.trim() }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch channel info');
      }

      const channelInfo = await response.json();
      setPreview(channelInfo);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch channel info');
    } finally {
      setIsLoading(false);
    }
  };

  const createPersona = async () => {
    if (!preview || !user) return;
    
    setIsCreating(true);
    try {
      const response = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: preview.channelId,
          username: preview.username,
          title: preview.title,
          description: preview.description,
          thumbnailUrl: preview.thumbnailUrl,
          videoCount: preview.videoCount,
          isPublic,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to create persona');
      }

      toast.success('Persona created! Video discovery has started in the background.');
      const result = await response.json();
      setIsOpen(false);
      setChannelInput('');
      setPreview(null);
      
      // Redirect to settings page
      if (result.redirectTo) {
        window.location.href = result.redirectTo;
      } else {
        window.location.reload();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create persona');
    } finally {
      setIsCreating(false);
    }
  };

  if (!user) {
    return (
      <Link href="/auth/signin">
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Sign in to add personas
        </Button>
      </Link>
    );
  }

  const canCreatePersona = personaCount < planInfo.limits.maxPersonas;
  const canCreatePrivatePersona = privatePersonaCount < planInfo.limits.maxPrivatePersonas;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button disabled={!canCreatePersona}>
          <Plus className="mr-2 h-4 w-4" />
          {canCreatePersona ? 'Add Persona' : 'Upgrade to Add Personas'}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-600" />
            Add YouTube Persona
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Plan Status */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Current Plan: {planInfo.name}</span>
              <Link href="/pricing">
                <Button variant="link" size="sm" className="h-auto p-0">
                  Upgrade
                </Button>
              </Link>
            </div>
            <div className="text-xs text-gray-600 space-y-1">
              <div>Personas: {personaCount}/{planInfo.limits.maxPersonas}</div>
              <div>Private Personas: {privatePersonaCount}/{planInfo.limits.maxPrivatePersonas}</div>
            </div>
          </div>

          {!canCreatePersona && (
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
              <p className="text-sm text-yellow-800">
                You've reached your persona limit. 
                <Link href="/pricing" className="font-medium underline ml-1">
                  Upgrade your plan
                </Link> to create more personas.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="channel">YouTube Channel</Label>
            <div className="flex gap-2">
              <Input
                id="channel"
                placeholder="Channel ID, username, or URL"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                className="flex-1"
                disabled={!canCreatePersona}
              />
              <Button 
                onClick={fetchChannelInfo} 
                disabled={isLoading || !channelInput.trim() || !canCreatePersona}
                variant="outline"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Preview'
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a YouTube channel ID, username (e.g., @channelname), or full URL
            </p>
          </div>

          {preview && (
            <Card className="border-2 border-primary/20">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <img
                    src={preview.thumbnailUrl}
                    alt={preview.title}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate">{preview.title}</h4>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {preview.description}
                    </p>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{preview.videoCount} videos</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 mt-4">
                  <Checkbox 
                    id="public" 
                    checked={isPublic} 
                    onCheckedChange={(checked) => setIsPublic(checked as boolean)}
                    disabled={!isPublic && !canCreatePrivatePersona}
                  />
                  <Label htmlFor="public" className="text-sm">
                    Make this persona public (others can chat with it)
                  </Label>
                </div>
                
                {!isPublic && !canCreatePrivatePersona && (
                  <p className="text-xs text-yellow-600 mt-2">
                    You've reached your private persona limit. This will be created as public.
                  </p>
                )}
                
                <Button 
                  onClick={createPersona} 
                  disabled={isCreating || !canCreatePersona}
                  className="w-full mt-4"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Persona...
                    </>
                  ) : (
                    'Create Persona'
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}