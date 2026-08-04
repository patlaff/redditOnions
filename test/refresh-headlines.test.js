import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPayload, parseArgs } from '../scripts/refresh-headlines.js';
import { DEFAULT_CORPUS_PATH } from '../lib/corpus.js';

function headline(id, isFake = false, extra = {}) {
  return {
    id,
    title: `Headline ${id}`,
    subreddit: isFake ? 'TheOnion' : 'nottheonion',
    isFake,
    articleUrl: null,
    redditUrl: null,
    ...extra,
  };
}

const at = () => new Date('2026-02-03T04:05:06.000Z');

describe('parseArgs', () => {
  it('defaults to merging into the shipped corpus', () => {
    assert.deepEqual(parseArgs([]), {
      replace: false,
      limit: 100,
      time: 'month',
      out: DEFAULT_CORPUS_PATH,
    });
  });

  it('reads the supported flags', () => {
    const options = parseArgs(['--replace', '--limit=25', '--time=year', '--out=/tmp/c.json']);

    assert.equal(options.replace, true);
    assert.equal(options.limit, 25);
    assert.equal(options.time, 'year');
    assert.equal(options.out, '/tmp/c.json');
  });

  it('rejects values Reddit would reject anyway', () => {
    assert.throws(() => parseArgs(['--limit=0']), /between 1 and 100/);
    assert.throws(() => parseArgs(['--limit=101']), /between 1 and 100/);
    assert.throws(() => parseArgs(['--limit=lots']), /between 1 and 100/);
    assert.throws(() => parseArgs(['--time=fortnight']), /--time must be one of/);
    assert.throws(() => parseArgs(['--force']), /Unknown argument: --force/);
  });
});

describe('buildPayload', () => {
  it('merges new posts into the existing corpus', () => {
    const { payload, added } = buildPayload({
      fetched: [headline('new')],
      existing: [headline('old')],
      now: at,
    });

    assert.equal(added, 1);
    assert.deepEqual(
      payload.headlines.map((h) => h.id),
      ['new', 'old'],
    );
    assert.equal(payload.generatedAt, '2026-02-03T04:05:06.000Z');
    assert.equal(payload.source, 'reddit');
  });

  it('lets a freshly fetched post overwrite the stored copy', () => {
    const { payload, added } = buildPayload({
      fetched: [headline('same', false, { title: 'Updated' })],
      existing: [headline('same', false, { title: 'Stale' })],
      now: at,
    });

    assert.equal(added, 0, 'an updated post is not a new one');
    assert.equal(payload.headlines.length, 1);
    assert.equal(payload.headlines[0].title, 'Updated');
  });

  it('drops the stored corpus entirely when replacing', () => {
    const { payload } = buildPayload({
      fetched: [headline('new')],
      existing: [headline('old')],
      replace: true,
      now: at,
    });

    assert.deepEqual(
      payload.headlines.map((h) => h.id),
      ['new'],
    );
  });

  it('orders real before satire, then by id, so refreshes diff cleanly', () => {
    const { payload } = buildPayload({
      fetched: [headline('zz'), headline('bb', true), headline('aa'), headline('cc', true)],
      now: at,
    });

    assert.deepEqual(
      payload.headlines.map((h) => h.id),
      ['aa', 'zz', 'bb', 'cc'],
    );
  });

  it('refuses to write an empty corpus over a good one', () => {
    assert.throws(
      () => buildPayload({ fetched: [], existing: [headline('old')], now: at }),
      /leaving the corpus untouched/,
    );
  });
});
