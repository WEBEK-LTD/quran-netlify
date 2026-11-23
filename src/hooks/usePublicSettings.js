import { useState, useEffect } from 'react';
import { getPublicSettings, getCachedPublicSettings, DEFAULT_PUBLIC_SETTINGS } from '../backend';

// GET /settings/public, fetched once per page load and shared.
// Until it arrives (or if it fails) everything is enabled — features are never
// hidden because of a network problem.
export function usePublicSettings() {
  const [settings, setSettings] = useState(() => getCachedPublicSettings() || { ...DEFAULT_PUBLIC_SETTINGS, loaded: false });
  useEffect(() => {
    let alive = true;
    getPublicSettings().then(s => { if (alive) setSettings(s); });
    return () => { alive = false; };
  }, []);
  return settings;
}

export function featureOn(settings, key) {
  return !settings || !settings.features || settings.features[key] !== false;
}
