// Type stubs for optional native packages used with dynamic imports + try/catch fallbacks.
// Remove these stubs once the packages are installed in the EAS build.

declare module 'expo-image-manipulator' {
  export enum SaveFormat {
    JPEG = 'jpeg',
    PNG = 'png',
    WEBP = 'webp',
  }
  export interface ImageResult {
    uri: string;
    width: number;
    height: number;
  }
  export function manipulateAsync(
    uri: string,
    actions: Array<{ resize?: { width?: number; height?: number } }>,
    options?: { compress?: number; format?: SaveFormat },
  ): Promise<ImageResult>;
}

declare module 'expo-video-thumbnails' {
  export interface VideoThumbnailsResult {
    uri: string;
    width: number;
    height: number;
  }
  export function getThumbnailAsync(
    sourceFilename: string,
    options?: { time?: number; quality?: number },
  ): Promise<VideoThumbnailsResult>;
}
