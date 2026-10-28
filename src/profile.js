// This endpoint is an unofficial user-account API, not the bot API.
// Never substitute GuildMember.premiumSince for the account's boost streak.
export class ProfileError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export class ProfileReader {
  constructor(token, request = fetch) {
    this.token = token; this.request = request;
    this.cache = new Map(); this.inflight = new Map();
    this.blockUntil = 0; this.disabled = false; this.tail = Promise.resolve();
  }
  get(userId, guildId) {
    if (!this.token) return Promise.reject(new ProfileError('NOT_CONFIGURED'));
    if (this.disabled) return Promise.reject(new ProfileError('AUTH'));
    const key = `${guildId}:${userId}`;
    const cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return Promise.resolve(cached.data);
    if (this.inflight.has(key)) return this.inflight.get(key);
    if (this.inflight.size >= 20) return Promise.reject(new ProfileError('BUSY'));
    const task = this.tail.then(async () => {
      if (this.disabled) throw new ProfileError('AUTH');
      if (Date.now() < this.blockUntil) throw new ProfileError('RATE_LIMIT');
      let response;
      try {
        const url = new URL(`https://discord.com/api/v9/users/${userId}/profile`);
        url.searchParams.set('guild_id', guildId);
        url.searchParams.set('with_mutual_guilds', 'false');
        url.searchParams.set('with_mutual_friends_count', 'false');
        response = await this.request(url, {
          headers: { Authorization: this.token, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000), redirect: 'error',
        });
      } catch { throw new ProfileError('NETWORK'); }
      if (response.status === 401) { this.disabled = true; throw new ProfileError('AUTH'); }
      if (response.status === 403) throw new ProfileError('FORBIDDEN');
      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        const seconds = Number(body.retry_after ?? response.headers.get('retry-after') ?? 60);
        this.blockUntil = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
        throw new ProfileError('RATE_LIMIT');
      }
      if (!response.ok) throw new ProfileError('UNAVAILABLE');
      const data = await response.json().catch(() => null);
      if (!data || data.user?.id !== userId) throw new ProfileError('UNAVAILABLE');
      // Retain only required subscription timestamps, not full user profiles.
      const minimal = {};
      for (const field of ['premium_since', 'premium_guild_since']) {
        if (Object.hasOwn(data, field)) minimal[field] = data[field];
      }
      if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, { data: minimal, until: Date.now() + 30000 });
      return minimal;
    });
    this.tail = task.catch(() => {}).then(() => new Promise(resolve => setTimeout(resolve, 1000)));
    this.inflight.set(key, task);
    task.finally(() => this.inflight.delete(key)).catch(() => {});
    return task;
  }
}
export function getStart(profile, kind) {
  const field = kind === 'nitro' ? 'premium_since' : 'premium_guild_since';
  if (!Object.hasOwn(profile, field)) throw new ProfileError('MISSING_DATE');
  if (profile[field] === null) throw new ProfileError('NO_DATE');
  const date = new Date(profile[field]);
  if (typeof profile[field] !== 'string' || !Number.isFinite(+date) || +date > Date.now()) throw new ProfileError('MISSING_DATE');
  return date;
}
