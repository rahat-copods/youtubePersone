'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2, Youtube } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [preview, setPreview] = useState<ChannelPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

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
      setIsOpen(false);
      setChannelInput('');
      setPreview(null);
      // Refresh the page to show the new persona
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create persona');
    } finally {
      setIsCreating(false);
    }
  };

  if (!user) {
    return (
      <Button variant="outline">
        <Plus className="mr-2 h-4 w-4" />
        Sign in to add personas
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Persona
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
          <div className="space-y-2">
            <Label htmlFor="channel">YouTube Channel</Label>
            <div className="flex gap-2">
              <Input
                id="channel"
                placeholder="Channel ID, username, or URL"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                className="flex-1"
              />
              <Button 
                onClick={fetchChannelInfo} 
                disabled={isLoading || !channelInput.trim()}
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
                  />
                  <Label htmlFor="public" className="text-sm">
                    Make this persona public (others can chat with it)
                  </Label>
                </div>
                
                <Button 
                  onClick={createPersona} 
                  disabled={isCreating}
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