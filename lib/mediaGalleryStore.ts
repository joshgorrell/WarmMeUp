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
