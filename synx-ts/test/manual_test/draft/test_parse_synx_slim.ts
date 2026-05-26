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

function findFirstNonWhitespacePos(text: string): number {
  const idx = text.search(/\S/);
  return idx < 0 ? text.length : idx;
}

const start_pos = findFirstNonWhitespacePos(src);
const parser = mkParser({ parser_nodes: [Synx], debug: true, timeout_s: 300 });
const result = parser.parse({ src, pos: start_pos }, Synx);
const success = result.kind === ParseResultKind.Success;

function printProfiling(): void {
  const profiling = parser.getParseProfiling();
  console.log("\n=== profiling ===");
  console.log(JSON.stringify({
    parse_elapsed_s: profiling.parse_elapsed_s,
    parse_single_node_enter_count: profiling.parse_single_node_enter_count,
    parse_single_node_max_depth: profiling.parse_single_node_max_depth,
  }, null, 2));

  const node_top = Array.from(profiling.parse_single_node_by_node_pos.entries())
    .sort((a, b) => b[1].enter_count - a[1].enter_count)
    .slice(0, 20)
    .map(([key, record]) => ({
      key,
      enter: record.enter_count,
      success: record.success_count,
      success_null: record.success_null_count,
      failure: record.failure_count,
    }));
  console.log("\n=== parseSingleNode top ===");
  console.log(JSON.stringify(node_top, null, 2));

  const alt_top = Array.from(profiling.pattern_set_alternative_by_node_pos_alt.entries())
    .sort((a, b) => b[1].enter_count - a[1].enter_count)
    .slice(0, 20)
    .map(([key, record]) => ({
      key,
      enter: record.enter_count,
      success: record.success_count,
      failure: record.failure_count,
    }));
  console.log("\n=== PatternSet alternative top ===");
  console.log(JSON.stringify(alt_top, null, 2));
}

console.log("=== parse synx-slim.synx ===");
console.log(JSON.stringify({
  project_root,
  synx_slim_path,
  kind: ParseResultKind[result.kind],
  success,
  start_pos,
  end_pos: result.end_pos,
  error: result.error,
  len: src.length,
  skipped_leading: src.slice(0, start_pos),
  fully_consumed: success && result.end_pos === src.length,
  next: src.slice(result.end_pos, result.end_pos + 160),
}, null, 2));

if (result.ast_nodes.length > 0) {
  console.log("\n=== result ===");
  console.log(SynxFmt.stringify(result.ast_nodes.length === 1 ? result.ast_nodes[0] : result.ast_nodes));
}

printProfiling();
