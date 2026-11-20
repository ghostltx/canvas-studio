declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CANVAS_RUNTIME_UPLOAD_TOKEN?: string;
  }
}
