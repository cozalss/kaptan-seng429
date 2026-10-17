// Export every zod schema of the panel (kaptan-panel/src/lib/domain) as JSON Schema (draft 2020-12).
//
//   node backend/tests/contract/export_schemas.mjs
//
// Output: backend/tests/contract/schemas/<Name>.json, one file per exported zod schema, plus
// index.json. pytest validates API responses against them (tests/contract/harness.py →
// assert_matches("ApprovalCard", payload)). Re-run whenever the panel's domain schemas change.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const panel = resolve(here, "../../../kaptan-panel");
const out = join(here, "schemas");
const { createJiti } = await import(pathToFileURL(join(panel, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(join(panel, "src/index.ts"), { alias: { "@": join(panel, "src") }, interopDefault: true });

const { z } = await jiti.import("zod");
const domain = await jiti.import(join(panel, "src/lib/domain/index.ts"));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const names = [];
for (const [name, value] of Object.entries(domain).sort(([a], [b]) => a.localeCompare(b))) {
  if (!(value instanceof z.ZodType)) continue;
  // io "output": the shape the server sends (defaults applied); refinements are not representable.
  const schema = z.toJSONSchema(value, { target: "draft-2020-12", io: "output", unrepresentable: "any" });
  writeFileSync(join(out, `${name}.json`), `${JSON.stringify(schema, null, 1)}\n`, "utf8");
  names.push(name);
}
writeFileSync(join(out, "index.json"), `${JSON.stringify(names, null, 1)}\n`, "utf8");
console.log(`exported ${names.length} schemas to ${out}`);
