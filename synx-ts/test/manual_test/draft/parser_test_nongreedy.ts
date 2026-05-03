/**
 * 临时非贪婪功能观察脚本。
 *
 * 这个脚本不是单测：不做 assert，不给 pass/fail 结论。
 * 它只跑几组代表性输入，打印 input 下标、slot 摘要、sep 摘要与 raw AST，方便人工观察是否符合预期。
 *
 *   npx tsc && node dist/test/manual_test/draft/parser_test_nongreedy.js
 */
import { inspect } from "node:util";
import type { ASTNode } from "../../../src/parser";
import { ParserImpl } from "../../../src/parser_impl";
import {
  AnyChar,
  mkByteSeq,
  mkCharRange,
  mkCharSet,
  mkPatternSeq,
  type ParserNode,
  type PatternSeq,
} from "../../../src/parser_node";

const A = mkByteSeq("a");
const B = mkByteSeq("b");
const C = mkByteSeq("c");
const Bang = mkByteSeq("!");
const Five = mkByteSeq("5");
const Comma = mkByteSeq(",");
const Space = mkCharSet(" ");
const Digit = mkCharRange("0", "9");

function isAstNode(value: unknown): value is ASTNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "parser_nodes" in value &&
    "range" in value &&
    "value" in value &&
    "raw_value" in value &&
    "seps" in value
  );
}

function nodeText(node: ASTNode): string {
  if (typeof node.value === "string") {
    return node.value;
  }
  if (Array.isArray(node.value)) {
    return node.value.map(slotText).join("");
  }
  return String(node.value);
}

function slotText(slot: ASTNode[] | ASTNode | null): string | null {
  if (slot === null) {
    return null;
  }
  if (Array.isArray(slot)) {
    return slot.map(nodeText).join("");
  }
  if (isAstNode(slot)) {
    return nodeText(slot);
  }
  return String(slot);
}

function slotRange(slot: ASTNode[] | ASTNode | null): Array<[number, number]> | [number, number] | null {
  if (slot === null) {
    return null;
  }
  if (Array.isArray(slot)) {
    return slot.map((node) => node.range);
  }
  return slot.range;
}

function printInputIndex(src: string): void {
  console.log(
    [...src].map((ch, i) => `${i}:${JSON.stringify(ch)}`).join("  "),
    "| len=",
    src.length,
  );
}

interface CaseDef {
  name: string;
  src: string;
  seq: PatternSeq;
  note: string;
}

function runCase(c: CaseDef, index: number): void {
  const parser = new ParserImpl({ parser_nodes: [] });
  parser.initParse({ src: c.src, pos: 0 });
  const result = parser.parsePatternSeq(c.seq);

  console.log("\n" + "=".repeat(90));
  console.log(`#${index + 1}: ${c.name}`);
  console.log(c.note);

  console.log("\n--- input index ---");
  printInputIndex(c.src);

  console.log("\n--- parse state ---");
  console.log({
    isSuccess: parser.isSuccess(),
    error: parser.getError(),
    end_pos: parser.input.pos,
    result_is_null: result === null,
  });

  if (result === null) {
    return;
  }

  const slots = result.value as Array<ASTNode[] | ASTNode | null>;
  const slotSummary = slots.map((slot, i) => ({
    slot: i,
    text: slotText(slot),
    range: slotRange(slot),
  }));
  const sepSummary = result.seps.map((sep, i) => ({
    sep: i,
    text: nodeText(sep),
    range: sep.range,
  }));

  console.log("\n--- slot summary ---");
  console.log(inspect(slotSummary, { depth: null, colors: true }));

  console.log("\n--- sep summary ---");
  console.log(inspect(sepSummary, { depth: null, colors: true }));

  console.log("\n--- raw AST ---");
  console.log(inspect(result, { depth: 8, colors: true }));
}

const cases: CaseDef[] = [
  {
    name: "ByteSeq *? + mandatory end",
    src: "aaabtail",
    seq: mkPatternSeq([A, B], "* ", false, null, false, null, [false, true]),
    note: "观察 A*? 如何在 B 前停下：slot0 应收连续 a，slot1 应收第一个 b，tail 不应被消费。",
  },
  {
    name: "连续 ?? 可全部取 0，直接落到最终边界",
    src: "c",
    seq: mkPatternSeq([A, B, C], "?? ", false, null, false, null, [false, false, true]),
    note: "观察 A? 与 B? 都可为空时，ends 是否优先让最终 C 接管；slot0/slot1 应表现为空。",
  },
  {
    name: "连续 *?：前一段收自身字符，中间 *? 可为空",
    src: "aaac",
    seq: mkPatternSeq([A, B, C], "** ", false, null, false, null, [false, false, true]),
    note: "观察 A*? B*? C：A 收 a，B*? 可为空，C 作为最终边界。",
  },
  {
    name: "+ 会断连续非贪婪链，但自身仍是边界",
    src: "aaabbc",
    seq: mkPatternSeq([A, B, C], "*+ ", false, null, false, null, [false, false, true]),
    note: "观察 A*? 后面遇到 B+?：B+ 不能作为可跳过链继续向后扩展，但应作为 A 的结束边界。",
  },
  {
    name: "sep + end 边界：边界 sep 应留给外层序列分隔",
    src: "a,a,5",
    seq: mkPatternSeq([A, Five], "+ ", false, Comma, false, null, [false, true]),
    note: "观察 A+? \\sep ',' 后接 5：第二个逗号不应被 A+? 的重复间隔吞掉，应留给子节点间 sep。",
  },
  {
    name: "ignore + end：ignore 由循环推进后再次检查 end",
    src: "aaa   b",
    seq: mkPatternSeq([A, B], "* ", false, null, false, Space as ParserNode, [false, true]),
    note: "观察 A*? 后有空格 ignore 再接 B：end 探测本身不跳 ignore，失败后由 ignore 循环推进，再检查 B。",
  },
  {
    name: "AnyChar * 强制非贪婪：可 0 次停在 end 前",
    src: "!",
    seq: mkPatternSeq([AnyChar, Bang], "* "),
    note: "观察 AnyChar* 遇到 !：AnyChar + * 按规范强制非贪婪，第一槽应为空，Bang 接管。",
  },
  {
    name: "AnyChar * 强制非贪婪：不吞后续 !",
    src: "abc!tail",
    seq: mkPatternSeq([AnyChar, Bang], "* "),
    note: "观察 AnyChar* 在 ! 前停止：slot0 应为 abc，slot1 为 !，tail 不被消费。",
  },
  {
    name: "AnyChar + 强制非贪婪：至少一次后停在 end",
    src: "x!",
    seq: mkPatternSeq([AnyChar, Bang], "+ "),
    note: "观察 AnyChar+ 不能 0 次，但在 x 后应尽早停给 Bang。",
  },
  {
    name: "AnyChar * + CharRange end",
    src: "abc1rest",
    seq: mkPatternSeq([AnyChar, Digit], "* "),
    note: "观察 end 不是 ByteSeq 而是 CharRange 时，AnyChar* 是否在第一个 digit 前停止。",
  },
];

console.log("临时非贪婪观察脚本：请人工查看每个 case 的 slots/ranges/seps/raw AST 是否符合预期。");
for (const [i, c] of cases.entries()) {
  runCase(c, i);
}
