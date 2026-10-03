import type { ConfigView } from "@/lib/domain";
import { RULES_HASH, PROMPT_MANIFEST_HASH } from "./explain-builder";
import { sha256Hex } from "@/lib/hash";

/**
 * Read-only configuration view for /admin (04 §11–12, 09 §8) and the audit chain's last
 * external anchor (09 §7.1: nightly signed commit of (date, chain_pos, head_hash)).
 * Course build: execution mode is paper; live mode's K1/K2 keys are off.
 */
export const AUDIT_ANCHOR = { at: "2027-01-10T23:00:00.000Z", chain_pos: 4_700 } as const;

export const MOCK_CONFIG: ConfigView = {
  execution_mode: "paper",
  strategy_versions: [
    { id: "v1.0-fwd", frozen_at: "2026-11-09T06:00:00.000Z", scope_tr: "Sınıflandırıcı + kurallar (ajansız kol)" },
    { id: "v1.1-fwd", frozen_at: "2026-11-23T06:00:00.000Z", scope_tr: "Tüm ajanlar (Okuyucu, Önemlilik, Kanıt, Şüpheci, Uyum)" },
  ],
  rules_version: "rules-v1.0",
  rules_hash: RULES_HASH,
  prompt_manifest_hash: PROMPT_MANIFEST_HASH,
  config_hash: sha256Hex("config:trading.yaml:v1.1-fwd").slice(0, 16),
  models: [
    { role_tr: "Sınıflandırıcı, Okuyucu, Önemlilik, Kanıt", model_id: "gemini-flash-lite-temsili-001" },
    { role_tr: "Şüpheci, Uyum", model_id: "groq/gpt-oss-120b-temsili" },
    { role_tr: "Prompt Guard", model_id: "prompt-guard-2-temsili" },
    { role_tr: "Yedek (yerel)", model_id: "ollama/qwen-temsili" },
  ],
  kap_poll_seconds: 30,
  approval_deadline_tr: "Bir sonraki seansın 09:50'si (R15)",
  demo_mode: true,
};
