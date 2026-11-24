declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    /** Bearer secret the PC sends to /sync, /actions, /health. */
    CLOUD_SYNC_SECRET: string;
    /** The X-Telegram-Bot-Api-Secret-Token that setWebhook was given. */
    WEBHOOK_SECRET: string;
    TELEGRAM_BOT_TOKEN: string;
    /** Optional: better one-line summaries for important disclosures of the person's own stocks. */
    GEMINI_API_KEY?: string;
    /** Optional overrides (tests). */
    GEMINI_DAILY_CAP?: string;
    KAP_BASE_URL?: string;
  }
}
interface Env extends Cloudflare.Env {}
