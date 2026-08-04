import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { titleCase } from '../lib/text.js';

describe('titleCase', () => {
  it('capitalizes ordinary words', () => {
    assert.equal(titleCase('man bites dog in park'), 'Man Bites Dog in Park');
  });

  it('keeps minor words lowercase except at the ends', () => {
    assert.equal(titleCase('the fall of the house of usher'), 'The Fall of the House of Usher');
    assert.equal(titleCase('a report on'), 'A Report On');
  });

  it('preserves acronyms and brand spellings', () => {
    assert.equal(titleCase('NASA loses another iPhone at eBay HQ'), 'NASA Loses Another iPhone at eBay HQ');
  });

  it('flattens shouted headlines', () => {
    assert.equal(titleCase('LOCAL MAN WINS THE LOTTERY'), 'Local Man Wins the Lottery');
  });

  it('capitalizes through leading punctuation', () => {
    assert.equal(titleCase('"quoted" headline'), '"Quoted" Headline');
  });

  it('preserves the original spacing', () => {
    assert.equal(titleCase('two  spaces here'), 'Two  Spaces Here');
  });

  it('returns an empty string for non-strings', () => {
    assert.equal(titleCase(undefined), '');
    assert.equal(titleCase(null), '');
  });
});
