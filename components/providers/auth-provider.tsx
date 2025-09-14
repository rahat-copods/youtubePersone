'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { getPlanInfo, PricingTier } from '@/lib/pricing';

interface AuthContextType {
  user: User | null;
  userPlan: string;
  planInfo: PricingTier;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshUserPlan: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userPlan, setUserPlan] = useState<string>('free');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchUserPlan = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('plan')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setUserPlan(data.plan || 'free');
      } else {
        setUserPlan('free');
      }
    } catch (error) {
      console.error('Error fetching user plan:', error);
      setUserPlan('free');
    }
  };

  const refreshUserPlan = async () => {
    if (user) {
      await fetchUserPlan(user.id);
    }
  };

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        await fetchUserPlan(user.id);
      }
      setLoading(false);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchUserPlan(session.user.id);
        } else {
          setUserPlan('free');
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error?.message };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });
    return { error: error?.message };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user,
      userPlan,
      planInfo: getPlanInfo(userPlan),
      loading,
      signIn,
      signUp,
      signOut,
      refreshUserPlan,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}