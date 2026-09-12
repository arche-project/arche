import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/core/schema.js';
import { parseOpds } from '../src/core/kiwix.js';
import { parseSidecar } from '../src/core/integrity.js';

const schema = { type: 'object', additionalProperties: false, required: ['id', 'name'], properties: { id: { type: 'string', pattern: '^[a-z-]+$' }, name: { $ref: '#/$defs/i18n' }, n: { type: ['integer', 'null'], minimum: 0 }, tags: { type: 'array', items: { enum: ['a', 'b'] }, uniqueItems: true } }, $defs: { i18n: { type: 'object', required: ['fr', 'en'], properties: { fr: { type: 'string' }, en: { type: 'string' } } } } };

test('schema validator accepts valid and rejects invalid', () => {
  assert.deepEqual(validate(schema, { id: 'ok', name: { fr: 'a', en: 'b' }, n: null, tags: ['a'] }), []);
  const errs = validate(schema, { id: 'BAD', name: { fr: 'a' }, n: -1, tags: ['a', 'a', 'z'], extra: 1 });
  const msgs = errs.map(e => e.path + ' ' + e.message).join('\n');
  assert.match(msgs, /id must match/); assert.match(msgs, /missing required property "en"/); assert.match(msgs, />= 0/);
  assert.match(msgs, /unique/); assert.match(msgs, /one of a, b/); assert.match(msgs, /unexpected property "extra"/);
});

test('OPDS parser extracts name, url, size, version', () => {
  const xml = `<feed><entry><title>Wikipédia</title><name>wikipedia_fr_all_maxi</name><updated>2026-08-24T00:00:00Z</updated>
    <link rel="http://opds-spec.org/acquisition/open-access" type="application/x-zim" href="https://download.kiwix.org/zim/wikipedia/wikipedia_fr_all_maxi_2026-08.zim.meta4" length="55834574848"/>
    </entry></feed>`;
  const [e] = parseOpds(xml);
  assert.equal(e.name, 'wikipedia_fr_all_maxi');
  assert.equal(e.url, 'https://download.kiwix.org/zim/wikipedia/wikipedia_fr_all_maxi_2026-08.zim');
  assert.equal(e.size_bytes, 55834574848);
  assert.equal(e.version, '2026-08');
});

test('sidecar checksum parser', () => {
  const h = 'ABCDEF0123'.repeat(6) + 'ABCD';
  assert.equal(parseSidecar(`${h}  wikipedia.zim\n`), h.toLowerCase());
  assert.equal(parseSidecar('not a hash'), null);
});
