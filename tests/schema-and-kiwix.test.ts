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

// Régression du premier run de catalog-update.yml (12 sept. 2026) : Kiwix publie désormais
// `<name>wikipedia_fr_all</name>` + `<flavour>maxi</flavour>` ; notre `kiwix_name` garde la forme longue.
// Regression: Kiwix moved the flavour out of `name` in 2026; `kiwix_name` keeps the long form.
import { kiwixNames, matchesKiwixName, kiwixBaseName } from '../src/core/kiwix.js';

test('kiwix : nom + saveur séparés (flux 2026) résolus depuis la forme longue du catalogue', () => {
  const xml = `<feed><entry><title>Wikipédia</title><name>wikipedia_fr_all</name><flavour>nopic</flavour><updated>2026-05-02T00:00:00Z</updated>
    <link rel="http://opds-spec.org/acquisition/open-access" type="application/x-zim" href="https://lb.download.kiwix.org/zim/wikipedia/wikipedia_fr_all_nopic_2026-05.zim.meta4" length="12912823296"/></entry>
    <entry><title>Wikipédia</title><name>wikipedia_fr_all</name><flavour>maxi</flavour><updated>2026-05-02T00:00:00Z</updated>
    <link rel="http://opds-spec.org/acquisition/open-access" type="application/x-zim" href="https://lb.download.kiwix.org/zim/wikipedia/wikipedia_fr_all_maxi_2026-05.zim.meta4" length="55438794752"/></entry>
    <entry><title>iFixit</title><name>ifixit_fr_all</name><updated>2026-03-01T00:00:00Z</updated>
    <link rel="http://opds-spec.org/acquisition/open-access" type="application/x-zim" href="https://lb.download.kiwix.org/zim/ifixit/ifixit_fr_all_2026-03.zim.meta4" length="3652281344"/></entry></feed>`;
  const entries = parseOpds(xml);
  assert.equal(entries.length, 3);
  assert.deepEqual(kiwixNames(entries[0]), ['wikipedia_fr_all_nopic', 'wikipedia_fr_all']);
  assert.deepEqual(kiwixNames(entries[2]), ['ifixit_fr_all']);
  assert.ok(matchesKiwixName(entries[0], 'wikipedia_fr_all_nopic'));
  assert.ok(!matchesKiwixName(entries[0], 'wikipedia_fr_all_maxi'));
  assert.ok(matchesKiwixName(entries[1], 'wikipedia_fr_all_maxi'));
  assert.ok(matchesKiwixName(entries[2], 'ifixit_fr_all'));
  // Ancien flux (saveur dans le nom) : toujours accepté.
  assert.ok(matchesKiwixName({ name: 'wikipedia_fr_all_maxi' }, 'wikipedia_fr_all_maxi'));
  assert.deepEqual(kiwixBaseName('wikipedia_fr_all_maxi'), { name: 'wikipedia_fr_all', flavour: 'maxi' });
  assert.deepEqual(kiwixBaseName('ifixit_fr_all'), { name: 'ifixit_fr_all' });
});
