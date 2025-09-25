import { useEffect, useState } from 'react';

/**
 * Hook to detect if we're running on the client-side
 * Useful for preventing hydration mismatches with SSR
 */
export function useIsClient(): boolean {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
}

export default useIsClient;