/**
 * 临时调试 case 93（Seq_LetterPlusComma_Digit + "a,a,5"）
 *
 *   npx tsc && node dist/test/manual_test/draft/parser_test_sep.js
 */
import { inspect } from "node:util";
import { ParserImpl } from "../../../src/parser_impl";
import { mkByteSeq, mkCharRange, mkCharSet, mkPatternSeq } from "../../../src/parser_node";
import type { CharMatchNode } from "../../../src/parser_node";

const Digit: CharMatchNode = mkCharRange("0", "9");
const Letter: CharMatchNode = mkCharSet([mkCharRange("a", "z")]);
const CommaSep = mkByteSeq(",");
const Seq_LetterPlusComma_Digit = mkPatternSeq([Letter, Digit], "+ ", false, CommaSep);

const SRC = "a,a,5";

function main(): void {
  console.log("=== 输入串下标 ===");
  console.log(
    [...SRC].map((ch, i) => `${i}:${JSON.stringify(ch)}`).join("  "),
    "| len=",
    SRC.length,
  );
  console.log("期望：`aa` 由 Letter+ 吃掉，逗号在重复间隔与子节点之间复用；Digit 在 index 4 的 `5`。\n");

  const parser = new ParserImpl({ parser_nodes: [] });

  // --- 1) 单独跑 parseNodeEx(Letter, '+', null, CommaSep)，看 pos / seps / nodes ---
  parser.initParse({ src: SRC, pos: 0 });
  const ex = parser.parseNodeEx(Letter, "+", null, CommaSep);
  console.log("=== parseNodeEx(Letter, '+', null, CommaSep) 之后 ===");
  console.log({
    isSuccess: parser.isSuccess(),
    getError: parser.getError(),
    input_pos: parser.input.pos,
    nodes_count: ex.nodes.length,
    seps_count: ex.seps.length,
    sep_ranges: ex.seps.map((s) => s.range),
    node_ranges: ex.nodes.map((n) => n.range),
  });
  console.log("ex 详情:\n" + inspect(ex, { depth: 6, colors: true }));

  // --- 2) 在 parseNodeEx 结束后，再尝试从当前 pos 吃一个 CommaSep（模拟 parsePatternSeq 子节点之间的 sep）---
  const posAfterLetterPlus = parser.input.pos;
  const sep2 = parser.parseSingleNode(CommaSep, null);
  console.log("\n=== 紧接着 parseSingleNode(CommaSep)（模拟子节点间分隔符）===");
  console.log({
    pos_before: posAfterLetterPlus,
    pos_after: parser.input.pos,
    isSuccess: parser.isSuccess(),
    getError: parser.getError(),
    sep2_ast_null: sep2 === null,
  });

  // --- 3) 整条 PatternSeq ---
  parser.initParse({ src: SRC, pos: 0 });
  const seqResult = parser.parsePatternSeq(Seq_LetterPlusComma_Digit);
  console.log("\n=== parsePatternSeq(Seq_LetterPlusComma_Digit) ===");
  console.log({
    isSuccess: parser.isSuccess(),
    getError: parser.getError(),
    input_pos: parser.input.pos,
    result_is_null: seqResult === null,
  });
  if (seqResult) {
    console.log("seps.length:", seqResult.seps.length);
    console.log(inspect(seqResult, { depth: 5, colors: true }));
  }

  console.log(
    "\n--- 控制台结论摘要 ---\n" +
      "parseNodeEx 在 `+` 循环里：先 parseSingleNode(CommaSep)，再 parseSingleNode(Letter)。\n" +
      "第二次重复成功后仍进入下一轮：又吃掉 index=3 的逗号，再对 index=4 的 `5` 做 Letter，失败时只 break，未把 pos/seps 回滚到吃逗号之前。\n" +
      "因此 input_pos=4，且 ret.seps 里已有两段逗号（重复间隔用掉了「本该留给子节点之间」的那一段）。\n" +
      "parsePatternSeq 随后还要 parseSingleNode(CommaSep)，当前字符是 `5` → 失败；整段序列按约定回绕 start，故 isSuccess=false、pos=0。\n" +
      "详细原因见本文件末尾多行注释。\n",
  );
}

main();

/*
 * =============================================================================
 * 原因分析（case 93：`Seq_LetterPlusComma_Digit` + `"a,a,5"`）
 * =============================================================================
 *
 * 1. 串结构：0:a  1:,  2:a  3:,  4:5
 *    语义上：Letter+ 应匹配两个 `a`，中间逗号属于「重复间隔」；index=3 的逗号属于「Letter+ 与 Digit 之间」；
 *    再匹配 Digit `5`。
 *
 * 2. parseNodeEx 对 `+` 且 sep≠null 的循环逻辑（parser_impl.ts）是：
 *      已有首单元后，反复：parseSingleNode(sep) → parseSingleNode(node)。
 *    在匹配完第二个 `a` 之后，循环又多跑一轮：成功消费了 index=3 的逗号（记入 ret.seps），
 *    接着对 `5` 做 Letter，失败，此时仅 `break`，没有把 input.pos 恢复到吃逗号之前，也没有从 ret.seps 里弹出该逗号。
 *
 * 3. 因此 parseNodeEx 返回时：input.pos=4（指向 `5`），ret.seps 长度为 2（两段逗号都算作「重复间隔」）。
 *    这与「第三段逗号应留给外层子节点间隔」冲突：同一条逗号不能被既当成「又一次 + 的前置 sep」又当成「与下一个子节点之间的 sep」，除非在「sep 成功、下一个 node 失败」时回滚 sep。
 *
 * 4. parsePatternSeq 在子节点循环里还会对「非最后一个子节点」再执行一次 parseSingleNode(node.sep)。
 *    此时游标已在 4，当前字符是 `5`，逗号已在步骤 2 被吃掉 → 必然失败 → 整条 PatternSeq 失败（并回绕到序列 start）。
 *
 * 5. 与 case 92（仅 `a,a`）不冲突：没有后续 Digit，parseNodeEx 多吞的「试探性」第三段 sep 不会暴露问题。
 *
 * 小结：失败根因是 `+`/sep 循环在「sep 成功、下一 node 失败」时缺少对 sep 消费与 ret.seps 的回滚，
 *       与 parsePatternSeq 外层「子节点之间的强制 sep」叠加后，case 93 必挂。
 * =============================================================================
 */
