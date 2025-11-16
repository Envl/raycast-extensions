import { useEffect, useRef } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useProductionSafeMount(mountFn: () => void | (() => void), deps: any[] = []) {
  const hasRun = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Prevent double execution in StrictMode
    if (hasRun.current) {
      return cleanupRef.current || undefined;
    }

    hasRun.current = true;
    const cleanup = mountFn();

    if (typeof cleanup === "function") {
      cleanupRef.current = cleanup;
    }

    return () => {
      hasRun.current = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, deps);

  // Reset on unmount
  useEffect(() => {
    return () => {
      hasRun.current = false;
      cleanupRef.current = null;
    };
  }, []);
}
