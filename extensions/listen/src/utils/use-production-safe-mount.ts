import { useEffect, useRef } from "react";

export function useProductionSafeMount(mountFn: () => (() => void) | undefined, deps: unknown[] = []) {
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
      cleanupRef.current?.();
      cleanupRef.current = null;
      // Don't reset hasRun here - keep it true to prevent re-execution
    };
  }, deps);
}
