// This is only a derived URL/version cache. Never write to the actual photo record.
const HERO_KEY = 'content/hero.json';
const CACHE_KEY = 'cache/hero-bootstrap-v1.json';

function summarizePhoto(data) {
  const photo = Array.isArray(data) ? data[0] : null;
  return photo?.image
    ? { image: true, version: String(photo.version || photo.updatedAt || '') }
    : null;
}

function validCache(cache, etag) {
  return cache?.schema === 1 && cache.etag === etag &&
    (cache.photo === null ||
      (cache.photo?.image === true && typeof cache.photo.version === 'string'));
}

export async function readHeroBootstrapData(store, key, fallback) {
  // Keep all non-hero reads and the existing manifest fallback untouched.
  if (key !== HERO_KEY) return fallback(store, key);
  try {
    // Validate against the current authoritative photo on EVERY request.
    // Both reads are small and parallel; no image/base64 body on a cache hit.
    const [current, cached] = await Promise.all([
      store.getMetadata(key, { consistency: 'strong' }),
      Promise.resolve().then(() => store.get(CACHE_KEY, {
        type: 'json', consistency: 'strong'
      })).catch(() => null)
    ]);
    if (current === null) return null;
    if (!current?.etag) return fallback(store, key);
    if (validCache(cached, current.etag)) {
      return cached.photo ? [cached.photo] : [];
    }

    // First use, photo replacement, or a missing/corrupt cache: read fresh data.
    // Use the ETag from THIS read, not the earlier metadata request, so a
    // concurrent photo change cannot label an old summary as a new image.
    const entry = await store.getWithMetadata(key, {
      type: 'json', consistency: 'strong'
    });
    if (!entry) return null;
    const photo = summarizePhoto(entry.data);
    if (entry.etag) {
      try {
        await store.setJSON(CACHE_KEY, { schema: 1, etag: entry.etag, photo });
      } catch {
        // Cache failure must never prevent the fresh photo from displaying.
      }
    }
    return photo ? [photo] : [];
  } catch {
    // Storage/SDK failures retain the original strongly consistent read path.
    return fallback(store, key);
  }
}
