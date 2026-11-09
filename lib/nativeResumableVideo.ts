import { createNativeTusTransport } from './nativeTusTransport';
import { uploadTusChunks } from './tusUploadSession';

/**
 * Native video TUS entry point. Caller retains ownership of the sandbox file
 * until this resolves. This is not yet the default Chat/Vault transfer path.
 */
export async function uploadNativeVideoResumable(params: {
  uri: string;
  bucket: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  accessToken: string;
  apiKey: string;
  supabaseUrl: string;
  onProgress?: (fraction: number) => void;
  resumeUrl?: string;
  onSessionReady?: (url: string) => void | Promise<void>;
}): Promise<string> {
  const endpoint = params.supabaseUrl.replace(/\/$/, '') + '/storage/v1/upload/resumable';
  return uploadTusChunks({
    endpoint,
    bucket: params.bucket,
    objectPath: params.storagePath,
    mimeType: params.mimeType,
    fileSize: params.fileSize,
    authorization: `Bearer ${params.accessToken}`,
    apiKey: params.apiKey,
    transport: createNativeTusTransport(params.uri),
    onProgress: params.onProgress,
    onSessionReady: params.onSessionReady,
  }, params.resumeUrl);
}
