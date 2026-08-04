import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { DEFAULT_CORPUS_PATH, loadCorpus, parseCorpus } from '../lib/corpus.js';

const quietLogger = { log() {}, error() {}, warn() {} };

function entry(overrides = {}) {
  return {
    id: 'abc',
    title: 'A headline',
    subreddit: 'nottheonion',
    isFake: false,
    articleUrl: 'https://example.com/story',
    redditUrl: 'https://www.reddit.com/r/nottheonion/comments/abc/',
    ...overrides,
  };
}

function corpusText(headlines, extra = {}) {
  return JSON.stringify({ generatedAt: '2026-01-01T00:00:00.000Z', headlines, ...extra });
}

describe('parseCorpus', () => {
  it('keeps a well-formed entry and its timestamp', () => {
    const { generatedAt, headlines } = parseCorpus(corpusText([entry()]));

    assert.equal(generatedAt, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(headlines, [
      {
        id: 'abc',
        title: 'A headline',
        subreddit: 'nottheonion',
        isFake: false,
        articleUrl: 'https://example.com/story',
        redditUrl: 'https://www.reddit.com/r/nottheonion/comments/abc/',
      },
    ]);
  });

  it('drops entries that are missing what the game renders', () => {
    const { headlines } = parseCorpus(
      corpusText([
        entry({ id: 'ok' }),
        entry({ id: undefined }),
        entry({ id: 'blank-title', title: '   ' }),
        entry({ id: 'no-sub', subreddit: '' }),
        // A missing flag would silently make the headline unwinnable.
        entry({ id: 'untagged', isFake: undefined }),
        entry({ id: 'stringly-tagged', isFake: 'true' }),
        null,
        'not an object',
      ]),
    );

    assert.deepEqual(
      headlines.map((h) => h.id),
      ['ok'],
    );
  });

  it('keeps only the first entry for a repeated id', () => {
    const { headlines } = parseCorpus(
      corpusText([entry({ id: 'dup', title: 'First' }), entry({ id: 'dup', title: 'Second' })]),
    );

    assert.equal(headlines.length, 1);
    assert.equal(headlines[0].title, 'First');
  });

  it('refuses a link the browser would execute', () => {
    const { headlines } = parseCorpus(
      corpusText([entry({ articleUrl: 'javascript:alert(1)', redditUrl: 'data:text/html,<x>' })]),
    );

    assert.equal(headlines[0].articleUrl, null);
    assert.equal(headlines[0].redditUrl, null);
  });

  it('rejects a file that is not a corpus', () => {
    assert.throws(() => parseCorpus('{ nope'), SyntaxError);
    assert.throws(() => parseCorpus('{"headlines": "soon"}'), /headlines/);
    assert.throws(() => parseCorpus('[]'), /headlines/);
  });
});

describe('loadCorpus', () => {
  it('degrades to an empty pool when the file is missing', async () => {
    const { generatedAt, headlines } = await loadCorpus({
      file: path.join(import.meta.dirname, 'no-such-corpus.json'),
      logger: quietLogger,
    });

    assert.equal(generatedAt, null);
    assert.deepEqual(headlines, []);
  });

  it('loads the corpus that ships with the app', async () => {
    const { headlines } = await loadCorpus({ file: DEFAULT_CORPUS_PATH, logger: quietLogger });

    // A committed corpus that fails to parse would leave the deployed app with
    // nothing to serve, so hold the shipped file to the same bar as the loader.
    assert.ok(headlines.length >= 20, `expected a playable corpus, got ${headlines.length}`);
    assert.ok(
      headlines.some((h) => h.isFake) && headlines.some((h) => !h.isFake),
      'the game needs both satire and real headlines to be winnable',
    );
  });
});
