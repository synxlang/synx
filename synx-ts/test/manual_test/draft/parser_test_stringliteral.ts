/**
 * Manual observation script for the `StringLiteral` grammar in `synx.synx`.
 * 手工观察 `synx.synx` 中的 `StringLiteral` 语法。
 *
 *   npm run build && node dist/test/manual_test/draft/parser_test_stringliteral.js
 *
 * If a TypeScript runner is installed:
 *   npx tsx test/manual_test/draft/parser_test_stringliteral.ts
 */
import type { ASTNode } from "../../../src/parser";
import { ParserImpl } from "../../../src/parser_impl";
import { SynxFmt } from "../../../src/synx_fmt";
import {
  AnyChar,
  mkByteSeq,
  mkPatternSeq,
  mkPatternSet,
  type ParserNode,
  type PatternSeq,
} from "../../../src/parser_node";

const Backslash = mkByteSeq("\\");
const Quote = mkByteSeq("\"");

/**
 * EscapeChar = ("\\", c:AnyChar) => c
 * `StringLiteral` semantic return is not applied here; this script observes raw parser nodes.
 * 这里不执行 `StringLiteral` 的语义返回，只观察底层解析节点。
 */
const EscapeChar: PatternSeq = mkPatternSeq([Backslash, AnyChar], "  ");

/**
 * {-EscapeChar; -"\""; AnyChar}
 * A `GeneralCharSet`-style PatternSet: reject escaped sequences and bare quotes, otherwise consume one Char.
 * `GeneralCharSet` 风格的 PatternSet：拒绝转义序列和裸引号，否则消费一个字符。
 */
const NonEscapeChar = mkPatternSet([EscapeChar, Quote, AnyChar], [true, true, false]);
const NonEscapeText: PatternSeq = mkPatternSeq([NonEscapeChar], "+");

/**
 * StringLiteral = (text:{EscapeChar; {-EscapeChar; -"\""; AnyChar}+}* \enclosedby "\"\"") => text
 */
const StringTextPiece = mkPatternSet([EscapeChar, NonEscapeText]);
const StringLiteral: PatternSeq = mkPatternSeq([StringTextPiece], "*", false, null, false, null, null, [Quote, Quote]);
const MutiStringLiterals: PatternSeq = mkPatternSeq([StringLiteral], "*", false, null, false, AnyChar);

interface CaseDef {
  id: number;
  name: string;
  src: string;
  note: string;
  root?: "StringLiteral" | "MutiStringLiterals";
}

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

function astText(node: ASTNode): string {
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
    return slot.map(astText).join("");
  }
  if (isAstNode(slot)) {
    return astText(slot);
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
    "| utf16_len=",
    src.length,
  );
}

function parseCaseRoot(src: string, root: PatternSeq): { parser: ParserImpl; result: ASTNode | null } {
  const parser = new ParserImpl({ parser_nodes: [] });
  parser.initParse({ src, pos: 0 });
  return {
    parser,
    result: parser.parsePatternSeq(root),
  };
}

function pieceKind(piece: ASTNode): string {
  const nodes = piece.parser_nodes;
  if (nodes.includes(EscapeChar)) {
    return "EscapeChar";
  }
  if (nodes.includes(NonEscapeText)) {
    return "NonEscapeText";
  }
  if (nodes.includes(NonEscapeChar)) {
    return "NonEscapeChar";
  }
  return "Unknown";
}

function pieceView(piece: ASTNode): object {
  return {
    kind: pieceKind(piece),
    range: piece.range,
    text: astText(piece),
    raw_value: piece.raw_value,
  };
}

function stringLiteralView(node: ASTNode): object {
  const slots = node.value as Array<ASTNode[] | ASTNode | null>;
  const textSlot = slots[0];
  const pieces = Array.isArray(textSlot)
    ? textSlot
    : textSlot === null
      ? []
      : [textSlot];

  return {
    range: node.range,
    left_quote: node.enclosure?.[0]?.value ?? null,
    left_quote_range: node.enclosure?.[0]?.range ?? null,
    text: slotText(textSlot),
    text_range: slotRange(textSlot),
    right_quote: node.enclosure?.[1]?.value ?? null,
    right_quote_range: node.enclosure?.[1]?.range ?? null,
    piece_count: pieces.length,
    pieces: pieces.map(pieceView),
  };
}

function stringLiteralNodes(rootName: CaseDef["root"] | "StringLiteral", result: ASTNode): ASTNode[] {
  if (rootName !== "MutiStringLiterals") {
    return [result];
  }
  const slots = result.value as Array<ASTNode[] | ASTNode | null>;
  const stringLiteralsSlot = slots[0];
  return Array.isArray(stringLiteralsSlot)
    ? stringLiteralsSlot
    : stringLiteralsSlot === null
      ? []
      : [stringLiteralsSlot];
}

function simpleStringLiteralView(src: string, node: ASTNode): object {
  return {
    range: node.range,
    text: src.slice(node.range[0], node.range[1]),
  };
}

function runCase(c: CaseDef): void {
  const rootName = c.root ?? "StringLiteral";
  const root = rootName === "MutiStringLiterals" ? MutiStringLiterals : StringLiteral;
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
    consumed_range: [0, parser.input.pos],
    tail_range: [parser.input.pos, c.src.length],
    result_is_null: result === null,
  }));
  console.log("\n--- consumed raw text ---");
  console.log(c.src.slice(0, parser.input.pos));
  console.log("\n--- tail raw text ---");
  console.log(c.src.slice(parser.input.pos));

  if (result === null) {
    return;
  }

  if (simple_print) {
    const stringLiterals = stringLiteralNodes(rootName, result);
    console.log("\n--- simple string literal slices ---");
    console.log(SynxFmt.stringify({
      string_literal_count: stringLiterals.length,
      string_literals: stringLiterals.map((node) => simpleStringLiteralView(c.src, node)),
    }));
    return;
  }

  const slots = result.value as Array<ASTNode[] | ASTNode | null>;

  if (rootName === "MutiStringLiterals") {
    const stringLiteralsSlot = slots[0];
    const stringLiterals = Array.isArray(stringLiteralsSlot)
      ? stringLiteralsSlot
      : stringLiteralsSlot === null
        ? []
        : [stringLiteralsSlot];

    console.log("\n--- MutiStringLiterals semantic view ---");
    console.log(SynxFmt.stringify({
      string_literal_count: stringLiterals.length,
      string_literals: stringLiterals.map(stringLiteralView),
    }));

    console.log("\n--- raw AST ---");
    console.log(SynxFmt.stringify(result));
    return;
  }

  console.log("\n--- StringLiteral semantic view ---");
  console.log(SynxFmt.stringify(stringLiteralView(result)));

  console.log("\n--- slot summary ---");
  console.log(
    SynxFmt.stringify(
      slots.map((slot, i) => ({
        slot: i,
        text: slotText(slot),
        range: slotRange(slot),
      })),
    ),
  );

  console.log("\n--- raw AST ---");
  console.log(SynxFmt.stringify(result));
}

const cases: CaseDef[] = [
  {
    id: 1,
    name: "Empty string literal",
    src: String.raw`"" tail`,
    note: "Observe an empty text slot and two enclosure quote nodes.",
  },
  {
    id: 2,
    name: "Simple ASCII content",
    src: String.raw`"abc_123";`,
    note: "Observe ordinary text grouped by the NonEscapeText `+` branch.",
  },
  {
    id: 3,
    name: "Spaces and punctuation",
    src: String.raw`"name=Expr; []{}() => , ." next`,
    note: "Punctuation and spaces are ordinary non-escape characters.",
  },
  {
    id: 4,
    name: "Escaped quote and escaped backslash",
    src: String.raw`"a\"b\\c" tail`,
    note: "EscapeChar should consume two-code-unit sequences such as \\\" and \\\\.",
  },
  {
    id: 5,
    name: "Escaped-looking newline marker",
    src: String.raw`"line1\nline2" tail`,
    note: "The characters backslash+n are one EscapeChar node, not an actual line delimiter.",
  },
  {
    id: 6,
    name: "Unicode and emoji content",
    src: String.raw`"中文 русский عربى 😀😺" tail`,
    note: "Observe AnyChar advancement for multilingual text and supplementary-plane emoji.",
  },
  {
    id: 7,
    name: "Bare quote terminates the string",
    src: String.raw`"abc"def"`,
    note: "The first bare quote closes the literal; remaining text should appear in tail.",
  },
  {
    id: 8,
    name: "Unclosed string literal",
    src: String.raw`"abc`,
    note: "Without the right enclosure quote, StringLiteral should fail and restore input position.",
  },
  {
    id: 9,
    name: "Trailing backslash before closing quote",
    src: String.raw`"abc\"`,
    note: "The backslash+quote is an EscapeChar, so no closing quote remains and the literal should fail.",
  },
  {
    id: 10,
    name: "Actual newline inside string",
    src: String.raw`"line1
line2" tail`,
    note: "According to the current grammar, AnyChar allows an actual LF inside StringLiteral.",
  },
  {
    id: 11,
    name: "MutiStringLiterals scans grammar-like assignments",
    root: "MutiStringLiterals",
    src: String.raw`RuleA="simple";
RuleB=("left", Symbol, "right");
RuleC={ "a"; "b\"c"; "中文😀"; };
tail = not_a_string;`,
    note: "Scan a mixed grammar-like text and collect string literals from rules, sequences, and sets.",
  },
  {
    id: 12,
    name: "MutiStringLiterals handles comments, paths, escapes, and unicode",
    root: "MutiStringLiterals",
    src: String.raw`\\ comment contains "quoted text" and should still be scanned as raw text
Path="C:\\tmp\\synx";
EscapedQuote="say \"hello\"";
Unicode="中文 русский عربى 😀😺";
ActualNewline="line1
line2";`,
    note: "Stress mixed text with comment-looking regions, escaped backslashes, escaped quotes, unicode, and an actual newline inside a string.",
  },
  {
    id: 13,
    name: "MutiStringLiterals skips malformed strings and keeps scanning",
    root: "MutiStringLiterals",
    src: String.raw`good1="ok";
bad="unterminated
still bad text
good2="after bad";
trailing="escape at end\"
good3="final";`,
    note: "Observe scanner behavior when malformed strings appear before later valid strings.",
  },
  {
    id: 14,
    name: "MutiStringLiterals noisy punctuation and adjacent strings",
    root: "MutiStringLiterals",
    src: String.raw`prefix("a""b", ["[]{}()=>;,.", "\\", "😃"]) suffix`,
    note: "Observe adjacent strings, dense punctuation, escaped backslash, and emoji in a compact noisy input.",
  },
];

const AllTestCaseIds = cases.map((c) => c.id);
let TestCaseIds = AllTestCaseIds;
// TestCaseIds = [12];
const simple_print = false;

console.log("Manual StringLiteral parser observation: inspect text pieces/ranges/tail/raw AST.");
for (const id of TestCaseIds) {
  const c = cases.find((item) => item.id === id);
  if (c === undefined) {
    console.log(`\nMissing test case id: ${id}`);
    continue;
  }
  runCase(c);
}
