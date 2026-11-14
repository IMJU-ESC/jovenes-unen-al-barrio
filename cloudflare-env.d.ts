declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    MEDIA_STORAGE?: string;
    BUCKET?: R2Bucket;
    BOOTSTRAP_TOKEN?: string;
  }
}
