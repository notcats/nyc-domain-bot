/**
 * Tests for src/filter.js using Node's built-in test runner.
 * Run with: node --test tests/filter.test.js
 *
 * filter.js uses getFilterConfig() from config.js which reads from the DB.
 * We mock the config module to return fixed defaults so tests are DB-free.
 */

import { describe, it, mock, before } from 'node:test';
import assert from 'node:assert/strict';

// Stub out config.js so filter.js never touches the DB
mock.module('../src/config.js', {
  namedExports: {
    getFilterConfig: () => ({
      MIN_BACKLINKS: 15,
      MAX_REGISTRATION_YEAR: 2018,
      MIN_WAYBACK_SNAPSHOTS: 10,
    }),
    updateFilterConfig: () => true,
    invalidateFilterCache: () => {},
    SETTING_KEYS: {
      MIN_BACKLINKS: 'MIN_BACKLINKS',
      MAX_REGISTRATION_YEAR: 'MAX_REGISTRATION_YEAR',
      MIN_WAYBACK_SNAPSHOTS: 'MIN_WAYBACK_SNAPSHOTS',
    },
  },
});

const { filterDomain, detectNiche } = await import('../src/filter.js');

// ─── filterDomain ─────────────────────────────────────────────────────────────

const VALID = {
  domain: 'nycrealestate.com',
  bl: 20,
  aby: 2015,
  acr: 15,
  wayback_clean: true,
};

describe('filterDomain', () => {
  it('passes a valid NYC domain', () => {
    const result = filterDomain(VALID);
    assert.equal(result.pass, true);
    assert.equal(result.reason, 'OK');
  });

  it('rejects non-.com TLD', () => {
    const result = filterDomain({ ...VALID, domain: 'nycrealestate.net' });
    assert.equal(result.pass, false);
    assert.match(result.reason, /\.com/);
  });

  it('rejects domain with banned keyword', () => {
    const result = filterDomain({ ...VALID, domain: 'nycparking.com' });
    assert.equal(result.pass, false);
    assert.match(result.reason, /parking/);
  });

  it('rejects domain without NYC keyword', () => {
    const result = filterDomain({ ...VALID, domain: 'lawfirm.com' });
    assert.equal(result.pass, false);
    assert.match(result.reason, /NYC/);
  });

  it('rejects insufficient backlinks', () => {
    const result = filterDomain({ ...VALID, bl: 5 });
    assert.equal(result.pass, false);
    assert.match(result.reason, /Мало бэклинков/);
  });

  it('rejects exactly at backlink threshold (must be >=)', () => {
    const result = filterDomain({ ...VALID, bl: 14 });
    assert.equal(result.pass, false);
  });

  it('passes at exactly the minimum backlinks', () => {
    const result = filterDomain({ ...VALID, bl: 15 });
    assert.equal(result.pass, true);
  });

  it('rejects registration year too new', () => {
    const result = filterDomain({ ...VALID, aby: 2020 });
    assert.equal(result.pass, false);
    assert.match(result.reason, /Год регистрации/);
  });

  it('passes at exactly the max registration year', () => {
    const result = filterDomain({ ...VALID, aby: 2018 });
    assert.equal(result.pass, true);
  });

  it('rejects insufficient Wayback snapshots', () => {
    const result = filterDomain({ ...VALID, acr: 3 });
    assert.equal(result.pass, false);
    assert.match(result.reason, /архивов/i);
  });

  it('rejects non-clean Wayback', () => {
    const result = filterDomain({ ...VALID, wayback_clean: false });
    assert.equal(result.pass, false);
    assert.match(result.reason, /Wayback/);
  });

  it('rejects missing/zero bl', () => {
    const result = filterDomain({ ...VALID, bl: 0 });
    assert.equal(result.pass, false);
  });

  it('rejects missing/zero aby', () => {
    const result = filterDomain({ ...VALID, aby: 0 });
    assert.equal(result.pass, false);
  });
});

// ─── detectNiche ──────────────────────────────────────────────────────────────

describe('detectNiche', () => {
  it('detects Legal NYC', () => {
    assert.equal(detectNiche('nyclawfirm.com'), 'Legal NYC');
  });

  it('detects Real Estate NYC', () => {
    assert.equal(detectNiche('nychomes.com'), 'Real Estate NYC');
  });

  it('detects Healthcare NYC', () => {
    assert.equal(detectNiche('nychealthclinic.com'), 'Healthcare NYC');
  });

  it('detects Brooklyn Local', () => {
    assert.equal(detectNiche('brooklynbars.com'), 'Brooklyn Local');
  });

  it('detects Manhattan Local', () => {
    assert.equal(detectNiche('manhattanwalk.com'), 'Manhattan Local');
  });

  it('falls back to NYC General', () => {
    assert.equal(detectNiche('bestnyc.com'), 'NYC General');
  });
});
