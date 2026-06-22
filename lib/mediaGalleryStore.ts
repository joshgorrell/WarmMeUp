export type GalleryItem = {
  id: string;
  storagePath: string;
  storageBucket: string;
  mediaType: string;
  allowScreenshot: boolean;
  allowSave: boolean;
  allowShare: boolean;
  signedUri?: string | null;
  thumbUri?: string | null;
  createdAt?: string | null;
  uploaderName?: string | null;
  interactionId?: string | null;
  coupleId?: string | null;
};

// Cross-navigation signed URL cache — keyed by storage path.
// Entries expire 11.5 hours after they were fetched (Supabase TTL is 12h).
const URL_CACHE_TTL_MS = 11.5 * 60 * 60 * 1000;

type CacheEntry = { url: string; fetchedAt: number };
const _urlCache: Record<string, CacheEntry> = {};

export function setCachedUrl(storagePath: string, url: string): void {
  _urlCache[storagePath] = { url, fetchedAt: Date.now() };
}

export function getCachedUrl(storagePath: string): string | null {
  const entry = _urlCache[storagePath];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > URL_CACHE_TTL_MS) {
    delete _urlCache[storagePath];
    return null;
  }
  return entry.url;
}

export function evictCachedUrl(storagePath: string): void {
  delete _urlCache[storagePath];
}

let _items: GalleryItem[] = [];

export function setGalleryItems(items: GalleryItem[]): void {
  _items = items;
}

export function getGalleryItems(): GalleryItem[] {
  return _items;
}

export function clearGalleryItems(): void {
  _items = [];
}
