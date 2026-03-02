export type SupabaseImageStoreConfig = {
  url: string;
  bucketName: string;
  objectPrefix: string;
  publicBaseUrl?: string;
};

export class SupabaseImageStore {
  private readonly objectPrefix: string;
  private readonly publicBaseUrl: string;

  constructor(config: SupabaseImageStoreConfig) {
    this.objectPrefix = config.objectPrefix;

    const trimmedUrl = config.url.replace(/\/+$/, '');
    const derivedBaseUrl = `${trimmedUrl}/storage/v1/object/public/${config.bucketName}`;
    this.publicBaseUrl = (config.publicBaseUrl ?? derivedBaseUrl).replace(/\/+$/, '');
  }

  private buildObjectPath(coinId: string) {
    return this.objectPrefix ? `${this.objectPrefix}/${coinId}.png` : `${coinId}.png`;
  }

  getCoinImageUrl(coinId: string): string {
    const objectPath = this.buildObjectPath(coinId);
    return `${this.publicBaseUrl}/${objectPath}`;
  }
}
