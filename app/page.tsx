'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { PersonaGrid } from '@/components/persona/persona-grid';
import { AddPersonaDialog } from '@/components/persona/add-persona-dialog';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

export default function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-teal-50">
      <Header />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <main className="lg:pl-80 transition-all duration-300">
        <div className="container mx-auto px-4 py-8">
          {/* Mobile menu button */}
          <div className="lg:hidden mb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-4 w-4 mr-2" />
              Chat History
            </Button>
          </div>

          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-2">
                YouTube Persona Chat
              </h1>
              <p className="text-gray-600 text-lg">
                Chat with AI personas powered by YouTube channel content
              </p>
            </div>
            <div className="flex-shrink-0 ml-4">
              <AddPersonaDialog />
            </div>
          </div>
          
          <PersonaGrid />
        </div>
      </main>
    </div>
  );
}