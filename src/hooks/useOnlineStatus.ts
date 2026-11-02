'use client';

import { useEffect, useState } from 'react';

/** Reactive navigator.onLine: true online, false offline (Prompt 9). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    () => typeof navigator === 'undefined' || navigator.onLine !== false,
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

export default useOnlineStatus;
