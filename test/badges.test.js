import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, progress, remaining } from '../src/badges.js';
import { ProfileReader, getStart } from '../src/profile.js';

test('calendar month boundaries and leap years do not overflow', () => {
  assert.equal(addMonths(new Date('2024-01-31T12:34:56Z'), 1).toISOString(), '2024-02-29T12:34:56.000Z');
  assert.equal(addMonths(new Date('2024-02-29T12:34:56Z'), 12).toISOString(), '2025-02-28T12:34:56.000Z');
});
test('exact transition and last badge', () => {
  assert.equal(progress('boost', '2026-01-12T00:00:00Z', new Date('2026-03-11T23:59:59Z')).months, 1);
  assert.equal(progress('boost', '2026-01-12T00:00:00Z', new Date('2026-03-12T00:00:00Z')).months, 2);
  assert.equal(progress('boost', '2020-01-01', new Date('2026-01-01')).upcoming.length, 0);
  assert.equal(progress('nitro', '2020-01-01', new Date('2026-01-01')).months, 72);
});
test('different members produce different personal timelines', () => {
  const now = new Date('2026-10-12T00:00:00Z');
  assert.equal(progress('nitro', '2026-01-12', now).months, 6);
  assert.equal(progress('nitro', '2024-01-12', now).months, 24);
  assert.throws(() => progress('nitro', 'bad-date', now));
  assert.throws(() => progress('nitro', '2027-01-01', now));
});
test('account boost streak is separate from Nitro subscription', () => {
  const p = { premium_since: '2022-01-01T00:00:00Z', premium_guild_since: '2024-06-01T00:00:00Z' };
  assert.equal(getStart(p, 'boost').getUTCFullYear(), 2024);
  assert.equal(getStart(p, 'nitro').getUTCFullYear(), 2022);
  assert.throws(() => getStart({}, 'nitro'), { code: 'MISSING_DATE' });
  assert.throws(() => getStart({ premium_since: null }, 'nitro'), { code: 'NO_DATE' });
});
test('minutes round up and never produce a negative countdown', () => {
  const now = new Date('2026-01-01');
  assert.equal(remaining(new Date(+now + 86460001), now), '1 يوم، 0 ساعة، 2 دقيقة');
  assert.equal(remaining(now, now), '0 يوم، 0 ساعة، 0 دقيقة');
});
test('reader scopes to invoking user, coalesces requests, caches minimal data', async () => {
  let calls = 0;
  const reader = new ProfileReader('test-placeholder', async url => {
    calls++;
    assert.equal(url.pathname, '/api/v9/users/123/profile');
    assert.equal(url.searchParams.get('guild_id'), '456');
    return new Response(JSON.stringify({ user: { id: '123' }, premium_since: '2020-01-01', private_extra: 'discard' }));
  });
  const [a, b] = await Promise.all([reader.get('123', '456'), reader.get('123', '456')]);
  assert.deepEqual(a, b);
  assert.deepEqual(a, { premium_since: '2020-01-01' });
  await reader.get('123', '456');
  assert.equal(calls, 1);
});
test('rate limit is honored without retry loops', async () => {
  let calls = 0;
  const reader = new ProfileReader('test-placeholder', async () => { calls++; return new Response('{"retry_after":30}', { status: 429 }); });
  await assert.rejects(reader.get('123', '456'), { code: 'RATE_LIMIT' });
  await assert.rejects(reader.get('124', '456'), { code: 'RATE_LIMIT' });
  assert.equal(calls, 1);
});
test('invalid credentials disable reader and missing configuration is explicit', async () => {
  const reader = new ProfileReader('test-placeholder', async () => new Response('{}', { status: 401 }));
  await assert.rejects(reader.get('123', '456'), { code: 'AUTH' });
  await assert.rejects(reader.get('124', '456'), { code: 'AUTH' });
  await assert.rejects(new ProfileReader('').get('123', '456'), { code: 'NOT_CONFIGURED' });
});
