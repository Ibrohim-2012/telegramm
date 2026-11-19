'use client';
import { useAuth } from '@/store/auth';
import { LoginScreen } from '@/components/LoginScreen';
import { AppShell } from '@/components/AppShell';
import { Splash } from '@/components/Splash';

export default function Home() {
  const state = useAuth((s) => s.state);
  if (state === 'loading') return <Splash />;
  if (state === 'ready') return <AppShell />;
  return <LoginScreen />;
}
