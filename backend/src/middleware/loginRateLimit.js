// In-memory limiter for failed logins (SEC-7, Phase 1 scope: login only).
// Counts failures per (IP + identifier) and per IP within a sliding window.
// State lives in this process: it resets on restart and is not shared between
// several Node processes. That is acceptable for the single-server setup.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IDENTIFIER = 5;
const MAX_FAILURES_PER_IP = 30;
const MAX_KEYS = 10000;

function createLoginRateLimiter({
  windowMs = WINDOW_MS,
  maxPerIdentifier = MAX_FAILURES_PER_IDENTIFIER,
  maxPerIp = MAX_FAILURES_PER_IP,
  now = () => Date.now(),
} = {}) {
  const failures = new Map(); // key -> array of timestamps

  function recent(key) {
    const cutoff = now() - windowMs;
    const list = (failures.get(key) || []).filter((t) => t > cutoff);
    if (list.length) failures.set(key, list);
    else failures.delete(key);
    return list;
  }

  function sweep() {
    if (failures.size <= MAX_KEYS) return;
    for (const key of [...failures.keys()]) recent(key);
  }

  function keysFor(ip, identifier) {
    const id = String(identifier || '').trim().toUpperCase();
    return { idKey: `id:${ip}|${id}`, ipKey: `ip:${ip}` };
  }

  // Returns the number of seconds to wait, or 0 when the attempt may proceed.
  function retryAfter(ip, identifier) {
    const { idKey, ipKey } = keysFor(ip, identifier);
    const checks = [
      [recent(idKey), maxPerIdentifier],
      [recent(ipKey), maxPerIp],
    ];
    let wait = 0;
    for (const [list, max] of checks) {
      if (list.length >= max) {
        const oldestRelevant = list[list.length - max];
        wait = Math.max(wait, Math.ceil((oldestRelevant + windowMs - now()) / 1000));
      }
    }
    return Math.max(0, wait);
  }

  function recordFailure(ip, identifier) {
    const { idKey, ipKey } = keysFor(ip, identifier);
    const t = now();
    failures.set(idKey, [...recent(idKey), t]);
    failures.set(ipKey, [...recent(ipKey), t]);
    sweep();
  }

  // A successful login clears the identifier counter (not the IP counter).
  function recordSuccess(ip, identifier) {
    failures.delete(keysFor(ip, identifier).idKey);
  }

  function reset() {
    failures.clear();
  }

  return { retryAfter, recordFailure, recordSuccess, reset };
}

const loginRateLimiter = createLoginRateLimiter();

module.exports = { createLoginRateLimiter, loginRateLimiter };
