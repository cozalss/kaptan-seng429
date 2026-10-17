// The panel's own functions as a test oracle for the Python ports (cross-language tests).
//
//   echo '{"op":"chain","fields":[...]}' | node backend/tests/contract/panel_oracle.mjs
//
// ops:
//   chain   {fields: ChainFields-without-chain_pos[]} -> AuditEntry[]  (audit-chain.ts appendToChain)
//   denied  {}                                         -> {action: {role|"none": reason}} (permissions.ts)
//   limits  {cases: LimitValue[][]}                    -> string[][]    (governance.ts limitViolations)
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const panel = resolve(here, "../../../kaptan-panel");
const { createJiti } = await import(pathToFileURL(join(panel, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(join(panel, "src/index.ts"), { alias: { "@": join(panel, "src") }, interopDefault: true });
const load = (p) => jiti.import(join(panel, "src", p));

const input = JSON.parse(readFileSync(0, "utf8"));
let result;
if (input.op === "chain") {
  const { appendToChain } = await load("lib/audit-chain.ts");
  result = appendToChain([], input.fields);
} else if (input.op === "denied") {
  const { ACTIONS, deniedReason } = await load("lib/auth/permissions.ts");
  const { ROLES } = await load("lib/domain/role-meta.ts");
  result = Object.fromEntries(
    ACTIONS.map((a) => [a, Object.fromEntries([...ROLES.map((r) => [r, deniedReason(a, r)]), ["none", deniedReason(a)]])]),
  );
} else if (input.op === "limits") {
  const { limitViolations } = await load("lib/domain/governance.ts");
  result = input.cases.map((values) => limitViolations(values));
} else {
  throw new Error(`unknown op ${input.op}`);
}
process.stdout.write(JSON.stringify(result));
