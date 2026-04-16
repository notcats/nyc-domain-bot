/**
 * Tests for src/wayback.js using Node's built-in test runner.
 * Run with: node --experimental-test-module-mocks --test tests/wayback.test.js
 *
 * axios is mocked so no real HTTP calls are made.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mock axios ───────────────────────────────────────────────────────────────

let _mockGet = async () => { throw new Error('No mock defined'); };

// axios is CJS – mock only the defaultExport (the axios instance)
mock.module('axios', {
  defaultExport: { get: (...args) => _mockGet(...args) },
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildCdxResponse(timestamps = []) {
  if (timestamps.length === 0) return { data: [] };
  return {
    data: [
      ['timestamp'],
      ...timestamps.map(ts => [ts]),
    ],
  };
}

const CLEAN_CONTENT = '<html><body><h1>Welcome to NYC Law</h1></body></html>';
const PARKED_CONTENT = '<html><body>domain is for sale — contact us</body></html>';

// ─── Import after mock ────────────────────────────────────────────────────────

const { getSnapshotCount, getDomainHistory, checkWayback } = await import('../src/wayback.js');

// ─── getSnapshotCount ─────────────────────────────────────────────────────────

describe('getSnapshotCount', () => {
  it('returns 0 when CDX returns empty array', async () => {
    _mockGet = async () => ({ data: [] });
    const count = await getSnapshotCount('example.com');
    assert.equal(count, 0);
  });

  it('returns 0 when CDX returns only header row', async () => {
    _mockGet = async () => ({ data: [['timestamp']] });
    const count = await getSnapshotCount('example.com');
    assert.equal(count, 0);
  });

  it('counts rows excluding header', async () => {
    _mockGet = async () => buildCdxResponse(['20150101', '20160101', '20170101']);
    const count = await getSnapshotCount('example.com');
    assert.equal(count, 3);
  });

  it('returns 0 on network error (after retries)', async () => {
    _mockGet = async () => { throw new Error('ECONNRESET'); };
    const count = await getSnapshotCount('example.com');
    assert.equal(count, 0);
  });
});

// ─── getDomainHistory ─────────────────────────────────────────────────────────

describe('getDomainHistory', () => {
  it('returns correct first/last year', async () => {
    _mockGet = async () => buildCdxResponse(['20130601', '20180301', '20211205']);
    const result = await getDomainHistory('example.com');
    assert.equal(result.firstYear, 2013);
    assert.equal(result.lastYear, 2021);
    assert.match(result.description, /2013/);
    assert.match(result.description, /2021/);
  });

  it('returns null years for empty response', async () => {
    _mockGet = async () => ({ data: [] });
    const result = await getDomainHistory('example.com');
    assert.equal(result.firstYear, null);
    assert.equal(result.lastYear, null);
  });

  it('handles network error gracefully', async () => {
    _mockGet = async () => { throw new Error('timeout'); };
    const result = await getDomainHistory('example.com');
    assert.equal(result.firstYear, null);
    assert.match(result.description, /Ошибка/);
  });
});

// ─── checkWayback ─────────────────────────────────────────────────────────────

describe('checkWayback', () => {
  it('returns clean=false when fewer than MIN_SNAPSHOTS', async () => {
    _mockGet = async () => buildCdxResponse(['20150101', '20160101']); // only 2 snapshots
    const result = await checkWayback('example.com');
    assert.equal(result.clean, false);
    assert.match(result.reason, /снимков/i);
  });

  it('returns clean=false when no available snapshot URL', async () => {
    let cdxCalled = false;
    _mockGet = async (url) => {
      if (url.includes('cdx') && !cdxCalled) {
        cdxCalled = true;
        return buildCdxResponse(['20150101','20160101','20170101','20180101','20190101','20200101']);
      }
      // /wayback/available — no snapshot
      return { data: { archived_snapshots: {} } };
    };
    const result = await checkWayback('example.com');
    assert.equal(result.clean, false);
  });

  it('returns clean=false for parked domain', async () => {
    let cdxCalled = false;
    _mockGet = async (url) => {
      if (url.includes('cdx') && !cdxCalled) {
        cdxCalled = true;
        return buildCdxResponse(['20150101','20160101','20170101','20180101','20190101','20200101']);
      }
      if (url.includes('available')) {
        return { data: { archived_snapshots: { closest: { url: 'https://web.archive.org/web/2020/example.com' } } } };
      }
      if (url.includes('web.archive.org/web/2020')) return { data: PARKED_CONTENT };
      return buildCdxResponse(['20150101', '20200101']);
    };
    const result = await checkWayback('example.com');
    assert.equal(result.clean, false);
    assert.match(result.reason, /флаг/i);
  });

  it('returns clean=true for a real site', async () => {
    let cdxCalled = false;
    _mockGet = async (url) => {
      if (url.includes('cdx') && !cdxCalled) {
        cdxCalled = true;
        return buildCdxResponse(['20150101','20160101','20170101','20180101','20190101','20200101']);
      }
      if (url.includes('available')) {
        return { data: { archived_snapshots: { closest: { url: 'https://web.archive.org/web/2020/example.com' } } } };
      }
      if (url.includes('web.archive.org/web/2020')) return { data: CLEAN_CONTENT };
      return buildCdxResponse(['20150101', '20200101']);
    };
    const result = await checkWayback('example.com');
    assert.equal(result.clean, true);
    assert.equal(result.reason, 'Реальный сайт');
  });
});
