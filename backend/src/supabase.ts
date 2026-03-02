import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseImageStoreConfig = {
  url: string;
  serviceRoleKey: string;
  bucketName: string;
  objectPrefix: string;
  publicBaseUrl?: string;
};

export class SupabaseImageStore {
  private readonly client: SupabaseClient;
  private readonly bucketName: string;
  private readonly objectPrefix: string;
  private readonly publicBaseUrl?: string;
  private readonly urlCache = new Map<string, string>();

  constructor(config: SupabaseImageStoreConfig) {
    this.client = createClient(config.url, config.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.bucketName = config.bucketName;
    this.objectPrefix = config.objectPrefix;
    this.publicBaseUrl = config.publicBaseUrl;
  }

  private buildObjectPath(coinId: string) {
    return this.objectPrefix ? `${this.objectPrefix}/${coinId}.png` : `${coinId}.png`;
  }

  async uploadCoinImage(params: {
    coinId: string;
    content: Buffer;
    contentType: string;
  }): Promise<string> {
    const objectPath = this.buildObjectPath(params.coinId);
    const cached = this.urlCache.get(objectPath);
    if (cached) {
      return cached;
    }

    const bucket = this.client.storage.from(this.bucketName);

    const { error: uploadError } = await bucket.upload(objectPath, params.content, {
      contentType: params.contentType,
      cacheControl: '31536000',
      upsert: true,
    });

    if (uploadError) {
      throw new Error(`Supabase upload failed for ${params.coinId}: ${uploadError.message}`);
    }

    const resolvedUrl = this.publicBaseUrl
      ? `${this.publicBaseUrl}/${objectPath}`
      : bucket.getPublicUrl(objectPath).data.publicUrl;

    this.urlCache.set(objectPath, resolvedUrl);
    return resolvedUrl;
  }
}
