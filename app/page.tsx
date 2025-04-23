'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PinLock from '@/components/PinLock';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/notes');
    }
  }, [router, isAuthenticated]);

  return <PinLock />;
}
