// The panel's audit-words.ts as an oracle for kaptan.audit.search (package C cross-language test).
//
//   echo '{"entries":[AuditEntry...],"queries":["örnek","#3907"]}' | node audit_words_oracle.mjs
//   -> {"sentences": string[], "matches": {query: chain_pos[]}}
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const panel = resolve(here, "../../../kaptan-panel");
const { createJiti } = await import(pathToFileURL(join(panel, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(join(panel, "src/index.ts"), { alias: { "@": join(panel, "src") }, interopDefault: true });
const { auditSentence, auditMatches } = await jiti.import(join(panel, "src/lib/audit-words.ts"));

const input = JSON.parse(readFileSync(0, "utf8"));
const sentences = input.entries.map((e) => auditSentence(e));
const matches = Object.fromEntries(
  input.queries.map((q) => [q, input.entries.filter((e) => auditMatches(e, q)).map((e) => e.chain_pos)]),
);
process.stdout.write(JSON.stringify({ sentences, matches }));
