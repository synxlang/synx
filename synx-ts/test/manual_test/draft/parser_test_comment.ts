/**
* Manual observation script for the `Comment` grammar in `synx.synx`.
* 手工观察 `synx.synx` 中的 `Comment` 语法。
*
*   npm run build && node dist/test/manual_test/draft/parser_test_comment.js
*
* If a TypeScript runner is installed:
*   npx tsx test/manual_test/draft/parser_test_comment.ts
*/
import type { AstNode } from "../../../src/ast_parser";
import { AstParserImpl } from "../../../src/ast_parser_impl";
import { SynxFmt } from "../../../src/synx_fmt";
import { AnyChar, completeCharSeq, completePatternSeq, completePatternSet, type ParserNode, type PatternSeq } from "../../../src/parser_node";
/**
 * `CommentPrefix = "\\\\"` from `synx.synx`, namely two backslash characters.
 * 来自 `synx.synx` 的 `CommentPrefix = "\\\\"`，也就是两个反斜杠字符。
 */
const CommentPrefix = completeCharSeq({ literal: "\\\\" });
const Lf = completeCharSeq({ literal: "\n" });
const CrLf = completeCharSeq({ literal: "\r\n" });
/**
 * Prefer CRLF before LF so Windows line delimiters stay as one AST node.
 * 优先匹配 CRLF，再匹配 LF，这样 Windows 换行会保留为一个 AST 节点。
 */
const LineDelimiter = completePatternSet({ sub_nodes: [CrLf, Lf] });
/**
 * Comment = (CommentPrefix, comment:AnyChar*, LineDelimiter?) => comment
 * AnyChar with `*` is normalized to non-greedy by `completePatternSeq`.
 * AnyChar 搭配 `*` 会被 `completePatternSeq` 规范为非贪婪。
 */
const Comment: PatternSeq = completePatternSeq({ sub_nodes: [CommentPrefix, AnyChar, LineDelimiter], sub_quantifiers: " *?" });
const MutiConmments: PatternSeq = completePatternSeq({ sub_nodes: [Comment], sub_quantifiers: "*", raw: false, sep: null, accept_trailing_sep: false, ignore: AnyChar }); // ignore Anychar
interface CaseDef {
    id: number;
    name: string;
    src: string;
    note: string;
    root?: "Comment" | "MutiConmments";
}
function isAstNode(value: unknown): value is AstNode {
  return (typeof value === "object" &&
        value !== null &&
        "parser_nodes" in value &&
        "range" in value &&
        "value" in value &&
        "raw_value" in value &&
        "seps" in value);
}
function astText(node: AstNode): string {
  if (typeof node.value === "string") {
    return node.value;
  }
  if (Array.isArray(node.value)) {
    return node.value.map(slotText).join("");
  }
  return String(node.value);
}
function slotText(slot: AstNode[] | AstNode | null): string | null {
  if (slot === null) {
    return null;
  }
  if (Array.isArray(slot)) {
    return slot.map(astText).join("");
  }
  if (isAstNode(slot)) {
    return astText(slot);
  }
  return String(slot);
}
function slotRange(slot: AstNode[] | AstNode | null): Array<[
    number,
    number
]> | [
    number,
    number
] | null {
  if (slot === null) {
    return null;
  }
  if (Array.isArray(slot)) {
    return slot.map((node) => node.range);
  }
  return slot.range;
}
function printable(value: string | null): string | null {
  return value;
}
function printInputIndex(src: string): void {
  console.log([...src].map((ch, i) => `${i}:${JSON.stringify(ch)}`).join("  "), "| len=", src.length);
}
function parseCaseRoot(src: string, root: PatternSeq): {
    parser: AstParserImpl;
    result: AstNode | null;
} {
  const parser = new AstParserImpl({ parser_nodes: [] });
  parser.initParse({ src, pos: 0 });
  return {
    parser,
    result: parser.parsePatternSeq(root),
  };
}
function commentView(node: AstNode): object {
  const slots = node.value as Array<AstNode[] | AstNode | null>;
  const [prefix, comment, lineDelimiter] = slots;
  return {
    range: node.range,
    text: astText(node),
    prefix: printable(slotText(prefix as AstNode | null)),
    prefix_range: slotRange(prefix as AstNode | null),
    comment: printable(slotText(comment as AstNode[] | AstNode | null)),
    comment_range: slotRange(comment as AstNode[] | AstNode | null),
    line_delimiter: printable(slotText(lineDelimiter as AstNode | null)),
    line_delimiter_range: slotRange(lineDelimiter as AstNode | null),
  };
}
function runCase(c: CaseDef): void {
  const rootName = c.root ?? "Comment";
  const root = rootName === "MutiConmments" ? MutiConmments : Comment;
  const { parser, result } = parseCaseRoot(c.src, root);
  console.log("\n" + "=".repeat(90));
  console.log(`#${c.id}: ${c.name}`);
  console.log(`root: ${rootName}`);
  console.log(c.note);
  console.log("\n--- input index ---");
  printInputIndex(c.src);
  console.log("\n--- parse state ---");
  console.log(SynxFmt.stringify({
    isSuccess: parser.isSuccess(),
    error: parser.getError(),
    end_pos: parser.input.pos,
    consumed: c.src.slice(0, parser.input.pos),
    tail: c.src.slice(parser.input.pos),
    result_is_null: result === null,
  }));
  if (result === null) {
    return;
  }
  const slots = result.value as Array<AstNode[] | AstNode | null>;
  if (rootName === "MutiConmments") {
    const commentsSlot = slots[0];
    const comments = Array.isArray(commentsSlot)
      ? commentsSlot
      : commentsSlot === null
        ? []
        : [commentsSlot];
    console.log("\n--- MutiConmments semantic view ---");
    console.log(SynxFmt.stringify({
      comment_count: comments.length,
      comments: comments.map(commentView),
    }));
    console.log("\n--- raw AST ---");
    console.log(SynxFmt.stringify(result));
    return;
  }
  const [prefix, comment, lineDelimiter] = slots;
  console.log("\n--- Comment semantic view ---");
  console.log(SynxFmt.stringify({
    prefix: printable(slotText(prefix as AstNode | null)),
    prefix_range: slotRange(prefix as AstNode | null),
    comment: printable(slotText(comment as AstNode[] | null)),
    comment_range: slotRange(comment as AstNode[] | null),
    line_delimiter: printable(slotText(lineDelimiter as AstNode | null)),
    line_delimiter_range: slotRange(lineDelimiter as AstNode | null),
  }));
  console.log("\n--- slot summary ---");
  console.log(SynxFmt.stringify(slots.map((slot, i) => ({
    slot: i,
    text: printable(slotText(slot)),
    range: slotRange(slot),
  }))));
  console.log("\n--- raw AST ---");
  console.log(SynxFmt.stringify(result));
}
const cases: CaseDef[] = [
  {
    id: 1,
    name: "LF line comment stops before newline",
    src: "\\\\ simple comment\nnext = rule;",
    note: "观察 AnyChar* 是否停在 LF 前，并由 LineDelimiter? 消费换行。",
  },
  {
    id: 2,
    name: "CRLF line comment keeps CRLF together",
    src: "\\\\ windows line\r\nnext = rule;",
    note: "观察 PatternSet 是否把 CRLF 当作一个 LineDelimiter，而不是先吃掉 LF。",
  },
  {
    id: 3,
    name: "End of file comment without line delimiter",
    src: "\\\\ final comment at eof",
    note: "观察 LineDelimiter? 为空时，Comment 是否仍然成功并消费到 EOF。",
  },
  {
    id: 4,
    name: "Empty comment line",
    src: "\\\\\nnext",
    note: "观察 comment:AnyChar* 为空时，前缀和换行是否仍正常匹配。",
  },
  {
    id: 5,
    name: "Symbols, punctuation, tabs, quotes, and escaped-looking text",
    src: "\\\\ name=Expr; text=\"a\\\\nb\"; path=C:\\\\tmp\\\\x\t# []{}() => \nnext",
    note: "复杂普通文本：分号、引号、看起来像转义的内容、制表符和符号都应归入 comment 正文。",
  },
  {
    id: 6,
    name: "Unicode and emoji content",
    src: "\\\\ 中文注释, русский текст, عربى, emoji 😀😺, math ∑≤∞\nnext",
    note: "观察 AnyChar 对多语言字符和 emoji 的范围推进；range 仍是 UTF-16 下标。",
  },
  {
    id: 7,
    name: "Comment body may contain another comment prefix",
    src: "\\\\ outer text \\\\ inner-looking prefix still body\nnext",
    note: "正文中的第二个 CommentPrefix 不应重新开始匹配，只是 AnyChar* 的普通内容。",
  },
  {
    id: 8,
    name: "Only one physical line is consumed",
    src: "\\\\ first line\n\\\\ second line\nthird",
    note: "观察第一个 Comment 只消费第一行，第二行注释留在 tail 中等待外层循环处理。",
  },
  {
    id: 9,
    name: "Bare carriage return is not LineDelimiter",
    src: "\\\\ text before bare CR\rnext",
    note: "根据 synx.synx，LineDelimiter 只有 LF 和 CRLF；这里应观察裸 CR 会被 AnyChar* 当作正文继续消费。",
  },
  {
    id: 10,
    name: "MutiConmments skips code and collects comment lines",
    root: "MutiConmments",
    src: [
      "RuleA=(A,B)=>value;",
      "\\\\ first comment after a rule",
      "RuleB={ X; Y; };",
      "plain text that should be ignored",
      "\\\\ second comment with punctuation: []{}() => ; ,",
      "RuleC=\"literal\";",
    ].join("\n"),
    note: "Use MutiConmments to scan a mixed grammar-like text and collect only comment lines.",
  },
  {
    id: 11,
    name: "MutiConmments handles LF, CRLF, empty comments, and EOF",
    root: "MutiConmments",
    src: "header\r\n\\\\ windows comment\r\nbody\n\\\\\nfooter\n\\\\ eof comment without newline",
    note: "Observe mixed line delimiters, an empty comment line, ignored non-comment text, and a final EOF comment.",
  },
  {
    id: 12,
    name: "MutiConmments with noisy prefixes and unicode text",
    root: "MutiConmments",
    src: [
      "not a comment: \\ single slash only",
      "\\\\ unicode comment: 中文, русский, عربى, emoji 😃😅",
      "stringLike = \"\\\\ not actually parsed as a string here\";",
      "\\\\ paths C:\\\\tmp\\\\x and escaped-looking text \\\\n stay in one comment",
      "tail text",
    ].join("\n"),
    note: "Stress a noisy mixed text: single slash is ignored, double slash starts comments, and unicode remains in the comment body.",
  },
];
const TestCaseIds = [10, 11, 12];
const TestCaseIdSet = new Set(TestCaseIds);
console.log("Manual Comment parser observation: inspect each case's slots/ranges/tail/raw AST.");
for (const c of cases) {
  if (TestCaseIdSet.has(c.id)) {
    runCase(c);
  }
}
