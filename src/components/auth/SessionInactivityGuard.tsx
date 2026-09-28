"use client";

import { useEffect, useRef } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";

// 12 hours in milliseconds
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const STORAGE_KEY = "sparkbooks_last_active_at";
const THROTTLE_MS = 30 * 1000; // Update timestamp at most once every 30 seconds

/**
 * SessionInactivityGuard enforces an automatic logout if the user has been
 * inactive for more than 12 hours. This is especially vital on mobile browsers
 * (iOS Safari, Android Chrome) where backgrounded tabs or sleeping devices
 * might otherwise retain Clerk session cookies indefinitely.
 */
export function SessionInactivityGuard() {
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const lastWriteRef = useRef<number>(0);

  useEffect(() => {
    if (!isSignedIn) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore localStorage errors (e.g. strict private browsing)
      }
      return;
    }

    const checkInactivity = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          localStorage.setItem(STORAGE_KEY, String(Date.now()));
          return;
        }

        const lastActive = parseInt(stored, 10);
        if (Number.isFinite(lastActive) && Date.now() - lastActive > TWELVE_HOURS_MS) {
          localStorage.removeItem(STORAGE_KEY);
          signOut(() => {
            window.location.href = "/sign-in?expired=1";
          });
        }
      } catch {
        // LocalStorage unavailable
      }
    };

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastWriteRef.current < THROTTLE_MS) return;
      lastWriteRef.current = now;
      try {
        localStorage.setItem(STORAGE_KEY, String(now));
      } catch {
        // Ignore
      }
    };

    // Check immediately upon mount (e.g. tab restored or app reopened)
    checkInactivity();
    recordActivity();

    // Check every 60 seconds while open
    const interval = setInterval(checkInactivity, 60 * 1000);

    // Recheck immediately when user switches back to this tab/app on mobile
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkInactivity();
        recordActivity();
      }
    };

    const onFocus = () => {
      checkInactivity();
      recordActivity();
    };

    // User interaction listeners to keep activity timestamp fresh
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    const handleUserActivity = () => {
      recordActivity();
    };

    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    return () => {
      clearInterval(interval);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
    };
  }, [isSignedIn, signOut]);

  return null;
}
