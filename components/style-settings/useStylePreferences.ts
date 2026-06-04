"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getDefaultPreferences } from "@/lib/style-settings/definitions";

type Preferences = Record<string, string | boolean | number>;

interface UseStylePreferencesReturn {
  preferences: Preferences;
  setPreference: (key: string, value: string | boolean | number) => void;
  save: () => Promise<void>;
  reload: () => void;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
}

/**
 * Shared hook for reading and writing style preferences.
 * Merges defaults with saved values. Auto-saves on debounce.
 */
export function useStylePreferences(documentType: string | null): UseStylePreferencesReturn {
  const defaults = getDefaultPreferences(documentType ?? null);
  const [serverPrefs, setServerPrefs] = useState<Preferences>({});
  const [localPrefs, setLocalPrefs] = useState<Preferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load from API
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const params = documentType ? `?documentType=${documentType}` : "";
        const res = await fetch(`/api/style-preferences${params}`);
        const json = await res.json();
        if (!cancelled && json.success) {
          setServerPrefs(json.data.preferences ?? {});
          setLocalPrefs(json.data.preferences ?? {});
        }
      } catch {
        // Use defaults on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    setLoading(true);
    load();
    return () => { cancelled = true; };
  }, [documentType, reloadKey]);

  // Merged view: defaults → server → local overrides
  const preferences: Preferences = { ...defaults, ...serverPrefs, ...localPrefs };

  const save = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      // Only send the diff from defaults
      const diff: Preferences = {};
      for (const [key, value] of Object.entries(localPrefs)) {
        if (value !== defaults[key]) diff[key] = value;
      }

      // Determine which preferences are universal vs type-specific
      // For simplicity, save all to the documentType row (or universal if null)
      await fetch("/api/style-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType, preferences: localPrefs }),
      });

      setServerPrefs({ ...localPrefs });
      setDirty(false);
    } catch {
      // Silently fail — preferences will be saved on next attempt
    } finally {
      setSaving(false);
    }
  }, [dirty, localPrefs, documentType, defaults]);

  const setPreference = useCallback(
    (key: string, value: string | boolean | number) => {
      setLocalPrefs((prev) => ({ ...prev, [key]: value }));
      setDirty(true);

      // Debounced auto-save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        // Trigger save via a ref-stable mechanism
        setSaving(true);
        fetch("/api/style-preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentType,
            preferences: { ...localPrefs, [key]: value },
          }),
        })
          .then((res) => res.json())
          .then((json) => {
            if (json.success) {
              setServerPrefs((prev) => ({ ...prev, [key]: value }));
              setDirty(false);
            }
          })
          .catch(() => {})
          .finally(() => setSaving(false));
      }, 2000);
    },
    [documentType, localPrefs],
  );

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { preferences, setPreference, save, reload, loading, saving, dirty };
}
