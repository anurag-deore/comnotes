'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PinLock from '@/components/PinLock';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const isAuthenticated = localStorage.getItem('isAuthenticated');
    if (isAuthenticated === 'true') {
      router.push('/notes');
    }
  }, [router]);

  return <PinLock />;
}
