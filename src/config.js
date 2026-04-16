/**
 * Runtime-configurable filter settings.
 * Defaults are used on first run; values are persisted to/from the DB.
 */

import { getFilterSetting, setFilterSetting } from './db.js';

export const SETTING_KEYS = {
  MIN_BACKLINKS: 'MIN_BACKLINKS',
  MAX_REGISTRATION_YEAR: 'MAX_REGISTRATION_YEAR',
  MIN_WAYBACK_SNAPSHOTS: 'MIN_WAYBACK_SNAPSHOTS',
};

const DEFAULTS = {
  [SETTING_KEYS.MIN_BACKLINKS]: 15,
  [SETTING_KEYS.MAX_REGISTRATION_YEAR]: 2018,
  [SETTING_KEYS.MIN_WAYBACK_SNAPSHOTS]: 10,
};

const _cache = { ...DEFAULTS };
let _loaded = false;

function ensureLoaded() {
  if (_loaded) return;
  for (const key of Object.keys(DEFAULTS)) {
    try {
      const val = getFilterSetting(key);
      if (val !== null && val !== undefined) {
        _cache[key] = val;
      }
    } catch {
      // DB not yet initialised; keep default
    }
  }
  _loaded = true;
}

/**
 * Returns a snapshot of the current filter configuration.
 * @returns {{ MIN_BACKLINKS: number, MAX_REGISTRATION_YEAR: number, MIN_WAYBACK_SNAPSHOTS: number }}
 */
export function getFilterConfig() {
  ensureLoaded();
  return { ..._cache };
}

/**
 * Updates a single filter setting and persists it to the DB.
 * @param {string} key   - One of SETTING_KEYS
 * @param {number} value
 * @returns {boolean} true if the key was recognised and saved
 */
export function updateFilterConfig(key, value) {
  const upper = key.toUpperCase();
  if (!(upper in DEFAULTS)) return false;
  const numVal = Number(value);
  if (!Number.isFinite(numVal)) return false;
  _cache[upper] = numVal;
  try {
    setFilterSetting(upper, numVal);
  } catch {
    // DB not ready; silently skip persistence
  }
  return true;
}

/** Resets the in-memory cache so the next read reloads from DB. */
export function invalidateFilterCache() {
  _loaded = false;
}
