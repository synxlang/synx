/**
 * Observe parsing synx-slim.synx with the hand-written slim self-description.
 *
 * Build/run:
 *   npm run build && node dist/test/manual_test/draft/test_parse_synx_slim.js
 *
 * If a TypeScript runner is installed:
 *   npx tsx test/manual_test/draft/test_parse_synx_slim.ts
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { mkParser, ParseResultKind } from "../../../src/parser";
import { SynxFmt } from "../../../src/synx_fmt";
import { Synx } from "../../../src/synx_slim_parser_node";

const PROJECT_ID = "67j5ThfYmyYPZb2ogVTaEL";

function findProjectRoot(start_dir: string): string {
  let dir = start_dir;
  for (;;) {
    const info_path = join(dir, ".uu", "info.json");
    if (existsSync(info_path)) {
      const info = JSON.parse(readFileSync(info_path, "utf8")) as { id?: unknown };
      if (info.id === PROJECT_ID) {
        return dir;
      }
    }

    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Cannot find project root containing .uu/info.json with id=${PROJECT_ID}`);
    }
    dir = parent;
  }
}

const project_root = findProjectRoot(__dirname);
const synx_slim_path = join(project_root, "synx-slim.synx");
const src = readFileSync(synx_slim_path, "utf8");

const parser = mkParser({ parser_nodes: [Synx], debug: true });
const result = parser.parse({ src, pos: 0 }, Synx);
const success = result.kind === ParseResultKind.Success;

console.log("=== parse synx-slim.synx ===");
console.log(JSON.stringify({
  project_root,
  synx_slim_path,
  kind: ParseResultKind[result.kind],
  success,
  end_pos: result.end_pos,
  len: src.length,
  fully_consumed: success && result.end_pos === src.length,
  next: src.slice(result.end_pos, result.end_pos + 160),
}, null, 2));

if (result.ast_nodes.length > 0) {
  console.log("\n=== result ===");
  console.log(SynxFmt.stringify(result.ast_nodes.length === 1 ? result.ast_nodes[0] : result.ast_nodes));
}
