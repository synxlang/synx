import { ParserImpl } from '../../../src/parser_impl';
import { mkCharRange, mkCharSet, mkByteSeq, mkPatternSeq } from '../../../src/parser_node';
import type { ByteSeq, CharMatchNode, ParserNode, PatternSeq } from '../../../src/parser_node';
import type { ASTNode, ParserInput } from '../../../src/parser';
import { strict as assert } from 'assert';
import { inspect } from 'node:util';

// Basic node constants
const Digit: CharMatchNode = mkCharRange('0', '9');
const Letter: CharMatchNode = mkCharSet([mkCharRange('a', 'z')]);
const Emoji: CharMatchNode = mkCharSet('😀'); // emoji is a multi-code-unit character
const Chinese: CharMatchNode = mkCharSet('中'); // Chinese character
/** Layout-only gap between sub-nodes / between `*`/`+` repeats (synx `\ignore Space`). */
const Space: CharMatchNode = mkCharSet(' ');
/** Used to verify ignore has lower priority than the real child match. */
const IgnoreLetter: CharMatchNode = Letter;

// Sequence node constants
const Seq_Digit_Letter_Mandatory = mkPatternSeq([Digit, Letter], '  ');
const Seq_Digit_Letter_Optional = mkPatternSeq([Digit, Letter], ' ?');
const Seq_Digit_Letter_Star = mkPatternSeq([Digit, Letter], ' *');
const Seq_Digit_Letter_Plus = mkPatternSeq([Digit, Letter], ' +');
const Seq_Digit_Letter_Digit_Mandatory = mkPatternSeq([Digit, Letter, Digit], '   ');
const Seq_Digit_Letter_Digit_Mixed = mkPatternSeq([Digit, Letter, Digit], '? *');
const Seq_Empty = mkPatternSeq([], '');

// New quantifier combination sequences
const Seq_Letter_Star_Digit_Mandatory = mkPatternSeq([Letter, Digit], '* ');
const Seq_Letter_Plus_Digit_Mandatory = mkPatternSeq([Letter, Digit], '+ ');
const Seq_Digit_Optional_Letter_Plus = mkPatternSeq([Digit, Letter], '?+');
const Seq_Digit_Star_Letter_Plus = mkPatternSeq([Digit, Letter], '*+');
const Seq_Letter_Plus_Plus = mkPatternSeq([Letter, Letter], '++');
const Seq_Digit_Optional_Optional = mkPatternSeq([Digit, Digit], '??');
const Seq_Letter_Star_Star = mkPatternSeq([Letter, Letter], '**');
const Seq_Digit_Optional_Star = mkPatternSeq([Digit, Letter], '?*');

// Unicode multi-code-unit character sequences
const Seq_Digit_Emoji = mkPatternSeq([Digit, Emoji], '  ');
const Seq_Digit_Chinese = mkPatternSeq([Digit, Chinese], '  ');
const Seq_Emoji_Letter = mkPatternSeq([Emoji, Letter], '  ');

// Longer sequences (4+ sub-nodes)
const Seq_Quad = mkPatternSeq([Digit, Letter, Digit, Letter], '    ');
const Seq_Quad_Mixed = mkPatternSeq([Digit, Letter, Digit, Letter], '? * ');

const Seq_Digit_Letter_Mandatory_IgnoreSpace = mkPatternSeq([Digit, Letter], '  ', false, null, false, Space as ParserNode);
const Seq_Digit_LetterStar_IgnoreSpace = mkPatternSeq([Digit, Letter], ' *', false, null, false, Space as ParserNode);
const Seq_Digit_Optional_Letter_Mandatory_IgnoreSpace = mkPatternSeq(
  [Digit, Letter],
  '? ',
  false,
  null,
  false,
  Space as ParserNode,
);
const Seq_Digit_Letter_Mandatory_IgnoreLetter = mkPatternSeq([Digit, Letter], '  ', false, null, false, IgnoreLetter as ParserNode);
const Seq_Digit_LetterStar_IgnoreLetter = mkPatternSeq([Digit, Letter], ' *', false, null, false, IgnoreLetter as ParserNode);

const CommaSep = mkByteSeq(',');
const Seq_DigitCommaLetter = mkPatternSeq([Digit, Letter], '  ', false, CommaSep);
const Seq_LetterPlusComma = mkPatternSeq([Letter], '+', false, CommaSep);
const Seq_LetterPlusComma_Digit = mkPatternSeq([Letter, Digit], '+ ', false, CommaSep);
const Seq_DigitCommaLetter_Trailing = mkPatternSeq([Digit, Letter], '  ', false, CommaSep, true);

/** `last_sep_end`: comma only when `pos` advanced — skip sep between consecutive empty `?`/`*` children. */
const Seq_DigitOptionalOptionalLetter_Comma = mkPatternSeq([Digit, Digit, Letter], '?? ', false, CommaSep);
const Seq_DigitStarLetterMandatory_Comma = mkPatternSeq([Digit, Letter], '* ', false, CommaSep);
const Seq_LetterOptionalLetterOptionalDigit_Comma = mkPatternSeq([Letter, Letter, Digit], '?? ', false, CommaSep);
const Seq_DigitOptionalOptionalLetter_CommaTrailing = mkPatternSeq([Digit, Digit, Letter], '?? ', false, CommaSep, true);
const Seq_DigitStarLetterStar_Comma = mkPatternSeq([Digit, Letter], '**', false, CommaSep);

/** `sep` + `PatternSeq.ignore` (spaces / junk before comma or around matches). */
const Seq_DigitCommaLetter_IgnoreSpace = mkPatternSeq([Digit, Letter], '  ', false, CommaSep, false, Space as ParserNode);
const Seq_DigitCommaLetter_IgnoreLetter = mkPatternSeq([Digit, Letter], '  ', false, CommaSep, false, IgnoreLetter as ParserNode);
const Seq_DigitOptionalOptionalLetter_Comma_IgnoreSpace = mkPatternSeq(
  [Digit, Digit, Letter],
  '?? ',
  false,
  CommaSep,
  false,
  Space as ParserNode,
);
const Seq_DigitStarLetterMandatory_Comma_IgnoreSpace = mkPatternSeq(
  [Digit, Letter],
  '* ',
  false,
  CommaSep,
  false,
  Space as ParserNode,
);
const Seq_DigitCommaLetter_Trailing_IgnoreSpace = mkPatternSeq(
  [Digit, Letter],
  '  ',
  false,
  CommaSep,
  true,
  Space as ParserNode,
);
const Seq_DigitStarLetterStar_Comma_IgnoreSpace = mkPatternSeq([Digit, Letter], '**', false, CommaSep, false, Space as ParserNode);

/** Helper function: construct child node ASTNode */
function mkChildAST(node: CharMatchNode, value: string, range: [number, number]): ASTNode {
  return {
    parser_nodes: [node],
    range,
    value,
    raw_value: value,
    seps: [],
  };
}

function mkByteSeqAST(n: ByteSeq, value: string, range: [number, number]): ASTNode {
  return {
    parser_nodes: [n],
    range,
    value,
    raw_value: value,
    seps: [],
  };
}

type LeafDesc = { node: CharMatchNode; value: string; range: [number, number] };
/**
 * 与 `parsePatternSeq` 的 `children` 一致：与 `sub_nodes` 等长；`null` 表示该槽未匹配（如 `?` 失败）；
 * CharMatch 在 `*`/`+` 且无 seq `sep`、且无 `PatternSeq.ignore` 时合并为单槽，用 `LeafDesc`；
 * 有 `sep` 或有 `ignore` 时 `*`/`+` 不合并，用 `LeafDesc[]`（每项一次匹配）；零次重复在非合并路径为 `[]`。
 * 非字符子节点等用 `ASTNode`。
 */
type SeqPart = ASTNode | LeafDesc | LeafDesc[] | null;

function normalizeSeqPart(p: SeqPart): ASTNode | ASTNode[] | null {
  if (p === null) {
    return null;
  }
  if (Array.isArray(p)) {
    return p.map((x) => mkChildAST(x.node, x.value, x.range));
  }
  if (p && typeof p === "object" && "parser_nodes" in p) {
    return p as ASTNode;
  }
  return mkChildAST((p as LeafDesc).node, (p as LeafDesc).value, (p as LeafDesc).range);
}

/** Helper: construct sequence ASTNode (`value` / `raw_value` mirror parser output). */
function mkSeqAST(
  seq: PatternSeq,
  range: [number, number],
  parts: SeqPart[],
  seps: ASTNode[] = [],
): ASTNode {
  const normalized = parts.map(normalizeSeqPart);
  return {
    parser_nodes: [seq],
    range,
    value: normalized,
    raw_value: normalized,
    seps,
  };
}

type TestCase = {
  id: number;
  seq: PatternSeq;
  input: ParserInput;
  expected: ASTNode | null;
  expected_error: boolean;
};

/** parsePatternSeq: multiple inputs covering sequence matching, various quantifier combinations, and failure scenarios */
function test_parsePatternSeq(): void {
  // Basic sequence: two mandatory items (digit + letter)
  const cases_basic: TestCase[] = [
    {
      id: 1,
      seq: Seq_Digit_Letter_Mandatory,
      input: { src: '5a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Mandatory, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
      ]),
      expected_error: false,
    },
    {
      id: 2,
      seq: Seq_Digit_Letter_Mandatory,
      input: { src: '5x', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Mandatory, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'x', range: [1, 2] },
      ]),
      expected_error: false,
    },
    { id: 3, seq: Seq_Digit_Letter_Mandatory, input: { src: '5', pos: 0 }, expected: null, expected_error: true },
    { id: 4, seq: Seq_Digit_Letter_Mandatory, input: { src: 'a', pos: 0 }, expected: null, expected_error: true },
  ];

  // Optional quantifier: digit + letter?
  const cases_optional: TestCase[] = [
    {
      id: 5,
      seq: Seq_Digit_Letter_Optional,
      input: { src: '5', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Optional, [0, 1], [
        { node: Digit, value: '5', range: [0, 1] },
        null,
      ]),
      expected_error: false,
    },
    {
      id: 6,
      seq: Seq_Digit_Letter_Optional,
      input: { src: '5a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Optional, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
      ]),
      expected_error: false,
    },
    { id: 7, seq: Seq_Digit_Letter_Optional, input: { src: 'a', pos: 0 }, expected: null, expected_error: true },
  ];

  // Zero or more quantifier: digit + letter*
  const cases_star: TestCase[] = [
    {
      id: 8,
      seq: Seq_Digit_Letter_Star,
      input: { src: '5', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Star, [0, 1], [
        { node: Digit, value: '5', range: [0, 1] },
        null,
      ]),
      expected_error: false,
    },
    {
      id: 9,
      seq: Seq_Digit_Letter_Star,
      input: { src: '5a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Star, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
      ]),
      expected_error: false,
    },
    {
      id: 10,
      seq: Seq_Digit_Letter_Star,
      input: { src: '5abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Star, [0, 4], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'abc', range: [1, 4] },
      ]),
      expected_error: false,
    },
    { id: 11, seq: Seq_Digit_Letter_Star, input: { src: 'a', pos: 0 }, expected: null, expected_error: true },
  ];

  // One or more quantifier: digit + letter+
  const cases_plus: TestCase[] = [
    {
      id: 12,
      seq: Seq_Digit_Letter_Plus,
      input: { src: '5a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Plus, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
      ]),
      expected_error: false,
    },
    {
      id: 13,
      seq: Seq_Digit_Letter_Plus,
      input: { src: '5abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Plus, [0, 4], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'abc', range: [1, 4] },
      ]),
      expected_error: false,
    },
    { id: 14, seq: Seq_Digit_Letter_Plus, input: { src: '5', pos: 0 }, expected: null, expected_error: true },
  ];

  // Multi-part sequence: three mandatory items (digit + letter + digit)
  const cases_triple: TestCase[] = [
    {
      id: 15,
      seq: Seq_Digit_Letter_Digit_Mandatory,
      input: { src: '5a3', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Digit_Mandatory, [0, 3], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
        { node: Digit, value: '3', range: [2, 3] },
      ]),
      expected_error: false,
    },
    { id: 16, seq: Seq_Digit_Letter_Digit_Mandatory, input: { src: '5a', pos: 0 }, expected: null, expected_error: true },
  ];

  // Mixed quantifiers: digit? + letter + digit*
  const cases_mixed: TestCase[] = [
    {
      id: 17,
      seq: Seq_Digit_Letter_Digit_Mixed,
      input: { src: 'a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Digit_Mixed, [0, 1], [
        null,
        { node: Letter, value: 'a', range: [0, 1] },
        null,
      ]),
      expected_error: false,
    },
    {
      id: 18,
      seq: Seq_Digit_Letter_Digit_Mixed,
      input: { src: '5a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Digit_Mixed, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
        null,
      ]),
      expected_error: false,
    },
    {
      id: 19,
      seq: Seq_Digit_Letter_Digit_Mixed,
      input: { src: '5a123', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Digit_Mixed, [0, 5], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
        { node: Digit, value: '123', range: [2, 5] },
      ]),
      expected_error: false,
    },
  ];

  // Empty sequence
  const cases_empty: TestCase[] = [
    {
      id: 20,
      seq: Seq_Empty,
      input: { src: '', pos: 0 },
      expected: mkSeqAST(Seq_Empty, [0, 0], []),
      expected_error: false,
    },
    {
      id: 21,
      seq: Seq_Empty,
      input: { src: 'x', pos: 0 },
      expected: mkSeqAST(Seq_Empty, [0, 0], []),
      expected_error: false,
    },
  ];

  // New quantifier combination: letter* + digit
  const cases_star_mandatory: TestCase[] = [
    {
      id: 22,
      seq: Seq_Letter_Star_Digit_Mandatory,
      input: { src: '5', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Star_Digit_Mandatory, [0, 1], [
        null,
        { node: Digit, value: '5', range: [0, 1] },
      ]),
      expected_error: false,
    },
    {
      id: 23,
      seq: Seq_Letter_Star_Digit_Mandatory,
      input: { src: 'a5', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Star_Digit_Mandatory, [0, 2], [
        { node: Letter, value: 'a', range: [0, 1] },
        { node: Digit, value: '5', range: [1, 2] },
      ]),
      expected_error: false,
    },
    {
      id: 24,
      seq: Seq_Letter_Star_Digit_Mandatory,
      input: { src: 'abc5', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Star_Digit_Mandatory, [0, 4], [
        { node: Letter, value: 'abc', range: [0, 3] },
        { node: Digit, value: '5', range: [3, 4] },
      ]),
      expected_error: false,
    },
    { id: 25, seq: Seq_Letter_Star_Digit_Mandatory, input: { src: 'abc', pos: 0 }, expected: null, expected_error: true },
  ];

  // New quantifier combination: letter+ + digit
  const cases_plus_mandatory: TestCase[] = [
    {
      id: 26,
      seq: Seq_Letter_Plus_Digit_Mandatory,
      input: { src: 'a5', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Plus_Digit_Mandatory, [0, 2], [
        { node: Letter, value: 'a', range: [0, 1] },
        { node: Digit, value: '5', range: [1, 2] },
      ]),
      expected_error: false,
    },
    {
      id: 27,
      seq: Seq_Letter_Plus_Digit_Mandatory,
      input: { src: 'abc5', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Plus_Digit_Mandatory, [0, 4], [
        { node: Letter, value: 'abc', range: [0, 3] },
        { node: Digit, value: '5', range: [3, 4] },
      ]),
      expected_error: false,
    },
    { id: 28, seq: Seq_Letter_Plus_Digit_Mandatory, input: { src: '5', pos: 0 }, expected: null, expected_error: true },
  ];

  // New quantifier combination: digit? + letter+
  const cases_optional_plus: TestCase[] = [
    {
      id: 29,
      seq: Seq_Digit_Optional_Letter_Plus,
      input: { src: 'a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Letter_Plus, [0, 1], [
        null,
        { node: Letter, value: 'a', range: [0, 1] },
      ]),
      expected_error: false,
    },
    {
      id: 30,
      seq: Seq_Digit_Optional_Letter_Plus,
      input: { src: '5a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Letter_Plus, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
      ]),
      expected_error: false,
    },
    {
      id: 31,
      seq: Seq_Digit_Optional_Letter_Plus,
      input: { src: '5abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Letter_Plus, [0, 4], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'abc', range: [1, 4] },
      ]),
      expected_error: false,
    },
    { id: 32, seq: Seq_Digit_Optional_Letter_Plus, input: { src: '', pos: 0 }, expected: null, expected_error: true },
  ];

  // New quantifier combination: digit* + letter+
  const cases_star_plus: TestCase[] = [
    {
      id: 33,
      seq: Seq_Digit_Star_Letter_Plus,
      input: { src: 'a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Star_Letter_Plus, [0, 1], [
        null,
        { node: Letter, value: 'a', range: [0, 1] },
      ]),
      expected_error: false,
    },
    {
      id: 34,
      seq: Seq_Digit_Star_Letter_Plus,
      input: { src: '5a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Star_Letter_Plus, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
      ]),
      expected_error: false,
    },
    {
      id: 35,
      seq: Seq_Digit_Star_Letter_Plus,
      input: { src: '123abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Star_Letter_Plus, [0, 6], [
        { node: Digit, value: '123', range: [0, 3] },
        { node: Letter, value: 'abc', range: [3, 6] },
      ]),
      expected_error: false,
    },
    { id: 36, seq: Seq_Digit_Star_Letter_Plus, input: { src: '', pos: 0 }, expected: null, expected_error: true },
  ];

  // New quantifier combination: letter+ + letter+
  // Note: Since letter+ is greedy matching, the first will match all possible letters, and the second will fail
  // So this combination cannot actually succeed unless there are other characters separating the first letter+
  // Here we test failure scenarios
  const cases_plus_plus: TestCase[] = [
    { id: 37, seq: Seq_Letter_Plus_Plus, input: { src: 'ab', pos: 0 }, expected: null, expected_error: true },
    { id: 38, seq: Seq_Letter_Plus_Plus, input: { src: 'abc', pos: 0 }, expected: null, expected_error: true },
    { id: 39, seq: Seq_Letter_Plus_Plus, input: { src: 'a', pos: 0 }, expected: null, expected_error: true },
    { id: 40, seq: Seq_Letter_Plus_Plus, input: { src: '', pos: 0 }, expected: null, expected_error: true },
  ];

  // New quantifier combination: digit? + digit?
  const cases_optional_optional: TestCase[] = [
    {
      id: 61,
      seq: Seq_Digit_Optional_Optional,
      input: { src: '', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Optional, [0, 0], [null, null]),
      expected_error: false,
    },
    {
      id: 62,
      seq: Seq_Digit_Optional_Optional,
      input: { src: '5', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Optional, [0, 1], [
        { node: Digit, value: '5', range: [0, 1] },
        null,
      ]),
      expected_error: false,
    },
    {
      id: 63,
      seq: Seq_Digit_Optional_Optional,
      input: { src: '53', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Optional, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Digit, value: '3', range: [1, 2] },
      ]),
      expected_error: false,
    },
  ];

  // New quantifier combination: letter* + letter*
  const cases_star_star: TestCase[] = [
    {
      id: 64,
      seq: Seq_Letter_Star_Star,
      input: { src: '', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Star_Star, [0, 0], [null, null]),
      expected_error: false,
    },
    {
      id: 65,
      seq: Seq_Letter_Star_Star,
      input: { src: 'a', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Star_Star, [0, 1], [
        { node: Letter, value: 'a', range: [0, 1] },
        null,
      ]),
      expected_error: false,
    },
    {
      id: 66,
      seq: Seq_Letter_Star_Star,
      input: { src: 'ab', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Star_Star, [0, 2], [
        { node: Letter, value: 'ab', range: [0, 2] },
        null,
      ]),
      expected_error: false,
    },
  ];

  // New quantifier combination: digit? + letter*
  const cases_optional_star: TestCase[] = [
    {
      id: 67,
      seq: Seq_Digit_Optional_Star,
      input: { src: '', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Star, [0, 0], [null, null]),
      expected_error: false,
    },
    {
      id: 68,
      seq: Seq_Digit_Optional_Star,
      input: { src: '5', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Star, [0, 1], [
        { node: Digit, value: '5', range: [0, 1] },
        null,
      ]),
      expected_error: false,
    },
    {
      id: 69,
      seq: Seq_Digit_Optional_Star,
      input: { src: 'abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Star, [0, 3], [
        null,
        { node: Letter, value: 'abc', range: [0, 3] },
      ]),
      expected_error: false,
    },
    {
      id: 70,
      seq: Seq_Digit_Optional_Star,
      input: { src: '5abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Star, [0, 4], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'abc', range: [1, 4] },
      ]),
      expected_error: false,
    },
  ];

  // Unicode multi-code-unit characters: digit + emoji
  const cases_unicode_emoji: TestCase[] = [
    {
      id: 41,
      seq: Seq_Digit_Emoji,
      input: { src: '5😀', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Emoji, [0, 3], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Emoji, value: '😀', range: [1, 3] },
      ]),
      expected_error: false,
    },
    { id: 42, seq: Seq_Digit_Emoji, input: { src: '5', pos: 0 }, expected: null, expected_error: true },
    { id: 43, seq: Seq_Digit_Emoji, input: { src: '😀', pos: 0 }, expected: null, expected_error: true },
  ];

  // Unicode multi-code-unit characters: digit + Chinese
  const cases_unicode_chinese: TestCase[] = [
    {
      id: 44,
      seq: Seq_Digit_Chinese,
      input: { src: '5中', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Chinese, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Chinese, value: '中', range: [1, 2] },
      ]),
      expected_error: false,
    },
    { id: 45, seq: Seq_Digit_Chinese, input: { src: '5', pos: 0 }, expected: null, expected_error: true },
  ];

  // Unicode multi-code-unit characters: emoji + letter
  const cases_unicode_emoji_letter: TestCase[] = [
    {
      id: 46,
      seq: Seq_Emoji_Letter,
      input: { src: '😀a', pos: 0 },
      expected: mkSeqAST(Seq_Emoji_Letter, [0, 3], [
        { node: Emoji, value: '😀', range: [0, 2] },
        { node: Letter, value: 'a', range: [2, 3] },
      ]),
      expected_error: false,
    },
    { id: 47, seq: Seq_Emoji_Letter, input: { src: '😀', pos: 0 }, expected: null, expected_error: true },
  ];

  // Non-zero starting position
  const cases_nonzero_pos: TestCase[] = [
    {
      id: 48,
      seq: Seq_Digit_Letter_Mandatory,
      input: { src: 'x5a', pos: 1 },
      expected: mkSeqAST(Seq_Digit_Letter_Mandatory, [1, 3], [
        { node: Digit, value: '5', range: [1, 2] },
        { node: Letter, value: 'a', range: [2, 3] },
      ]),
      expected_error: false,
    },
    {
      id: 49,
      seq: Seq_Digit_Letter_Star,
      input: { src: 'x5abc', pos: 1 },
      expected: mkSeqAST(Seq_Digit_Letter_Star, [1, 5], [
        { node: Digit, value: '5', range: [1, 2] },
        { node: Letter, value: 'abc', range: [2, 5] },
      ]),
      expected_error: false,
    },
    {
      id: 50,
      seq: Seq_Digit_Emoji,
      input: { src: 'x5😀', pos: 1 },
      expected: mkSeqAST(Seq_Digit_Emoji, [1, 4], [
        { node: Digit, value: '5', range: [1, 2] },
        { node: Emoji, value: '😀', range: [2, 4] },
      ]),
      expected_error: false,
    },
    { id: 51, seq: Seq_Digit_Letter_Mandatory, input: { src: 'x5', pos: 1 }, expected: null, expected_error: true },
  ];

  // Longer sequences (4+ sub-nodes)
  const cases_long: TestCase[] = [
    {
      id: 52,
      seq: Seq_Quad,
      input: { src: '5a3b', pos: 0 },
      expected: mkSeqAST(Seq_Quad, [0, 4], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
        { node: Digit, value: '3', range: [2, 3] },
        { node: Letter, value: 'b', range: [3, 4] },
      ]),
      expected_error: false,
    },
    { id: 53, seq: Seq_Quad, input: { src: '5a3', pos: 0 }, expected: null, expected_error: true },
    {
      id: 54,
      seq: Seq_Quad_Mixed,
      input: { src: 'a3b', pos: 0 },
      expected: mkSeqAST(Seq_Quad_Mixed, [0, 3], [
        null,
        { node: Letter, value: 'a', range: [0, 1] },
        { node: Digit, value: '3', range: [1, 2] },
        { node: Letter, value: 'b', range: [2, 3] },
      ]),
      expected_error: false,
    },
    {
      id: 55,
      seq: Seq_Quad_Mixed,
      input: { src: '5a123b', pos: 0 },
      expected: mkSeqAST(Seq_Quad_Mixed, [0, 6], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
        { node: Digit, value: '123', range: [2, 5] },
        { node: Letter, value: 'b', range: [5, 6] },
      ]),
      expected_error: false,
    },
  ];

  // Middle sub-node failure but preceded by optional/zero-or-more
  const cases_mid_failure: TestCase[] = [
    {
      id: 56,
      seq: Seq_Letter_Star_Digit_Mandatory,
      input: { src: 'abc', pos: 0 },
      expected: null,
      expected_error: true,
    },
    {
      id: 57,
      seq: Seq_Digit_Optional_Letter_Plus,
      input: { src: '5', pos: 0 },
      expected: null,
      expected_error: true,
    },
  ];

  // Empty string with mandatory items
  const cases_empty_string: TestCase[] = [
    { id: 58, seq: Seq_Digit_Letter_Mandatory, input: { src: '', pos: 0 }, expected: null, expected_error: true },
    { id: 59, seq: Seq_Digit_Letter_Plus, input: { src: '', pos: 0 }, expected: null, expected_error: true },
    { id: 60, seq: Seq_Letter_Plus_Digit_Mandatory, input: { src: '', pos: 0 }, expected: null, expected_error: true },
  ];

  // PatternSeq.ignore: gaps between sub-nodes and between `*`/`+` repeats (not in raw_value)
  const cases_ignore: TestCase[] = [
    {
      id: 71,
      seq: Seq_Digit_Letter_Mandatory_IgnoreSpace,
      input: { src: '5a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Mandatory_IgnoreSpace, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
      ]),
      expected_error: false,
    },
    {
      id: 72,
      seq: Seq_Digit_Letter_Mandatory_IgnoreSpace,
      input: { src: '5 a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Mandatory_IgnoreSpace, [0, 3], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [2, 3] },
      ]),
      expected_error: false,
    },
    {
      id: 73,
      seq: Seq_Digit_Letter_Mandatory_IgnoreSpace,
      input: { src: '5   a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Mandatory_IgnoreSpace, [0, 5], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [4, 5] },
      ]),
      expected_error: false,
    },
    {
      id: 74,
      seq: Seq_Digit_Letter_Mandatory_IgnoreSpace,
      input: { src: '5 ', pos: 0 },
      expected: null,
      expected_error: true,
    },
    {
      id: 75,
      seq: Seq_Digit_LetterStar_IgnoreSpace,
      input: { src: '1abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_LetterStar_IgnoreSpace, [0, 4], [
        { node: Digit, value: '1', range: [0, 1] },
        [{ node: Letter, value: 'abc', range: [1, 4] }],
      ]),
      expected_error: false,
    },
    {
      id: 76,
      seq: Seq_Digit_LetterStar_IgnoreSpace,
      input: { src: '1 abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_LetterStar_IgnoreSpace, [0, 5], [
        { node: Digit, value: '1', range: [0, 1] },
        [{ node: Letter, value: 'abc', range: [2, 5] }],
      ]),
      expected_error: false,
    },
    {
      id: 77,
      seq: Seq_Digit_LetterStar_IgnoreSpace,
      input: { src: '1 abc ', pos: 0 },
      expected: mkSeqAST(Seq_Digit_LetterStar_IgnoreSpace, [0, 5], [
        { node: Digit, value: '1', range: [0, 1] },
        [{ node: Letter, value: 'abc', range: [2, 5] }],
      ]),
      expected_error: false,
    },
    {
      id: 78,
      seq: Seq_Digit_Optional_Letter_Mandatory_IgnoreSpace,
      input: { src: 'a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Letter_Mandatory_IgnoreSpace, [0, 1], [
        null,
        { node: Letter, value: 'a', range: [0, 1] },
      ]),
      expected_error: false,
    },
    {
      id: 79,
      seq: Seq_Digit_Optional_Letter_Mandatory_IgnoreSpace,
      input: { src: '5 a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Letter_Mandatory_IgnoreSpace, [0, 3], [
        { node: Digit, value: '5', range: [0, 1] },
        { node: Letter, value: 'a', range: [2, 3] },
      ]),
      expected_error: false,
    },
    {
      id: 80,
      seq: Seq_Digit_Letter_Mandatory_IgnoreLetter,
      input: { src: '1a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Mandatory_IgnoreLetter, [0, 2], [
        { node: Digit, value: '1', range: [0, 1] },
        { node: Letter, value: 'a', range: [1, 2] },
      ]),
      expected_error: false,
    },
    {
      id: 81,
      seq: Seq_Digit_LetterStar_IgnoreLetter,
      input: { src: '1abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_LetterStar_IgnoreLetter, [0, 4], [
        { node: Digit, value: '1', range: [0, 1] },
        [{ node: Letter, value: 'abc', range: [1, 4] }],
      ]),
      expected_error: false,
    },
  ];

  const cases_sep: TestCase[] = [
    {
      id: 90,
      seq: Seq_DigitCommaLetter,
      input: { src: '5,a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitCommaLetter,
        [0, 3],
        [
          { node: Digit, value: '5', range: [0, 1] },
          { node: Letter, value: 'a', range: [2, 3] },
        ],
        [mkByteSeqAST(CommaSep, ',', [1, 2])],
      ),
      expected_error: false,
    },
    {
      id: 91,
      seq: Seq_DigitCommaLetter,
      input: { src: '5a', pos: 0 },
      expected: null,
      expected_error: true,
    },
    {
      id: 92,
      seq: Seq_LetterPlusComma,
      input: { src: 'a,a', pos: 0 },
      expected: mkSeqAST(
        Seq_LetterPlusComma,
        [0, 3],
        [[
          { node: Letter, value: 'a', range: [0, 1] },
          { node: Letter, value: 'a', range: [2, 3] },
        ]],
        [mkByteSeqAST(CommaSep, ',', [1, 2])],
      ),
      expected_error: false,
    },
    {
      id: 93,
      seq: Seq_LetterPlusComma_Digit,
      input: { src: 'a,a,5', pos: 0 },
      expected: mkSeqAST(
        Seq_LetterPlusComma_Digit,
        [0, 5],
        [[
          { node: Letter, value: 'a', range: [0, 1] },
          { node: Letter, value: 'a', range: [2, 3] },
        ],
          { node: Digit, value: '5', range: [4, 5] },
        ],
        [mkByteSeqAST(CommaSep, ',', [1, 2]), mkByteSeqAST(CommaSep, ',', [3, 4])],
      ),
      expected_error: false,
    },
    {
      id: 94,
      seq: Seq_DigitCommaLetter_Trailing,
      input: { src: '5,a,', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitCommaLetter_Trailing,
        [0, 4],
        [
          { node: Digit, value: '5', range: [0, 1] },
          { node: Letter, value: 'a', range: [2, 3] },
        ],
        [mkByteSeqAST(CommaSep, ',', [1, 2]), mkByteSeqAST(CommaSep, ',', [3, 4])],
      ),
      expected_error: false,
    },
    {
      id: 95,
      seq: Seq_DigitCommaLetter_Trailing,
      input: { src: '5,a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitCommaLetter_Trailing,
        [0, 3],
        [
          { node: Digit, value: '5', range: [0, 1] },
          { node: Letter, value: 'a', range: [2, 3] },
        ],
        [mkByteSeqAST(CommaSep, ',', [1, 2])],
      ),
      expected_error: false,
    },
  ];

  // `last_sep_end` in parsePatternSeq: require `sep` only after `pos` moved past its previous end (no false comma between all-empty `?`/`*` slots).
  const cases_sep_last_sep_end: TestCase[] = [
    {
      id: 96,
      seq: Seq_DigitOptionalOptionalLetter_Comma,
      input: { src: 'a', pos: 0 },
      expected: mkSeqAST(Seq_DigitOptionalOptionalLetter_Comma, [0, 1], [
        null,
        null,
        { node: Letter, value: 'a', range: [0, 1] },
      ], []),
      expected_error: false,
    },
    {
      id: 97,
      seq: Seq_DigitOptionalOptionalLetter_Comma,
      input: { src: '5,a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitOptionalOptionalLetter_Comma,
        [0, 3],
        [
          { node: Digit, value: '5', range: [0, 1] },
          null,
          { node: Letter, value: 'a', range: [2, 3] },
        ],
        [mkByteSeqAST(CommaSep, ',', [1, 2])],
      ),
      expected_error: false,
    },
    {
      id: 98,
      seq: Seq_DigitOptionalOptionalLetter_Comma,
      input: { src: '5,6,a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitOptionalOptionalLetter_Comma,
        [0, 5],
        [
          { node: Digit, value: '5', range: [0, 1] },
          { node: Digit, value: '6', range: [2, 3] },
          { node: Letter, value: 'a', range: [4, 5] },
        ],
        [mkByteSeqAST(CommaSep, ',', [1, 2]), mkByteSeqAST(CommaSep, ',', [3, 4])],
      ),
      expected_error: false,
    },
    {
      id: 99,
      seq: Seq_DigitOptionalOptionalLetter_Comma,
      input: { src: '5,6a', pos: 0 },
      expected: null,
      expected_error: true,
    },
    {
      id: 100,
      seq: Seq_DigitStarLetterMandatory_Comma,
      input: { src: 'a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitStarLetterMandatory_Comma,
        [0, 1],
        [[], { node: Letter, value: 'a', range: [0, 1] }],
        [],
      ),
      expected_error: false,
    },
    {
      id: 101,
      seq: Seq_DigitStarLetterMandatory_Comma,
      input: { src: '5,a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitStarLetterMandatory_Comma,
        [0, 3],
        [[{ node: Digit, value: '5', range: [0, 1] }], { node: Letter, value: 'a', range: [2, 3] }],
        [mkByteSeqAST(CommaSep, ',', [1, 2])],
      ),
      expected_error: false,
    },
    {
      id: 102,
      seq: Seq_LetterOptionalLetterOptionalDigit_Comma,
      input: { src: '0', pos: 0 },
      expected: mkSeqAST(
        Seq_LetterOptionalLetterOptionalDigit_Comma,
        [0, 1],
        [null, null, { node: Digit, value: '0', range: [0, 1] }],
        [],
      ),
      expected_error: false,
    },
    {
      id: 103,
      seq: Seq_DigitOptionalOptionalLetter_CommaTrailing,
      input: { src: 'a,', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitOptionalOptionalLetter_CommaTrailing,
        [0, 2],
        [null, null, { node: Letter, value: 'a', range: [0, 1] }],
        [mkByteSeqAST(CommaSep, ',', [1, 2])],
      ),
      expected_error: false,
    },
    {
      id: 104,
      seq: Seq_DigitStarLetterStar_Comma,
      input: { src: '', pos: 0 },
      expected: mkSeqAST(Seq_DigitStarLetterStar_Comma, [0, 0], [[], []], []),
      expected_error: false,
    },
    {
      id: 105,
      seq: Seq_DigitStarLetterStar_Comma,
      input: { src: 'a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitStarLetterStar_Comma,
        [0, 1],
        [[], [{ node: Letter, value: 'a', range: [0, 1] }]],
        [],
      ),
      expected_error: false,
    },
    {
      id: 106,
      seq: Seq_DigitOptionalOptionalLetter_Comma,
      input: { src: 'xxa', pos: 2 },
      expected: mkSeqAST(Seq_DigitOptionalOptionalLetter_Comma, [2, 3], [
        null,
        null,
        { node: Letter, value: 'a', range: [2, 3] },
      ], []),
      expected_error: false,
    },
  ];

  // `sep` combined with `ignore`: flexible whitespace / ignored chars around commas; still respects `last_sep_end` (no comma between all-empty `?`/`*` slots).
  const cases_sep_with_ignore: TestCase[] = [
    {
      id: 107,
      seq: Seq_DigitCommaLetter_IgnoreSpace,
      input: { src: '5 ,a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitCommaLetter_IgnoreSpace,
        [0, 4],
        [
          { node: Digit, value: '5', range: [0, 1] },
          { node: Letter, value: 'a', range: [3, 4] },
        ],
        [mkByteSeqAST(CommaSep, ',', [2, 3])],
      ),
      expected_error: false,
    },
    {
      id: 108,
      seq: Seq_DigitCommaLetter_IgnoreSpace,
      input: { src: '5, a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitCommaLetter_IgnoreSpace,
        [0, 4],
        [
          { node: Digit, value: '5', range: [0, 1] },
          { node: Letter, value: 'a', range: [3, 4] },
        ],
        [mkByteSeqAST(CommaSep, ',', [1, 2])],
      ),
      expected_error: false,
    },
    {
      id: 109,
      seq: Seq_DigitOptionalOptionalLetter_Comma_IgnoreSpace,
      input: { src: '  a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitOptionalOptionalLetter_Comma_IgnoreSpace,
        [0, 3],
        [null, null, { node: Letter, value: 'a', range: [2, 3] }],
        [],
      ),
      expected_error: false,
    },
    {
      id: 110,
      seq: Seq_DigitOptionalOptionalLetter_Comma_IgnoreSpace,
      input: { src: '5 ,a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitOptionalOptionalLetter_Comma_IgnoreSpace,
        [0, 4],
        [
          { node: Digit, value: '5', range: [0, 1] },
          null,
          { node: Letter, value: 'a', range: [3, 4] },
        ],
        [mkByteSeqAST(CommaSep, ',', [2, 3])],
      ),
      expected_error: false,
    },
    {
      id: 111,
      seq: Seq_DigitStarLetterMandatory_Comma_IgnoreSpace,
      input: { src: '1 ,a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitStarLetterMandatory_Comma_IgnoreSpace,
        [0, 4],
        [[{ node: Digit, value: '1', range: [0, 1] }], { node: Letter, value: 'a', range: [3, 4] }],
        [mkByteSeqAST(CommaSep, ',', [2, 3])],
      ),
      expected_error: false,
    },
    {
      id: 112,
      seq: Seq_DigitCommaLetter_Trailing_IgnoreSpace,
      input: { src: '5,a ,', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitCommaLetter_Trailing_IgnoreSpace,
        [0, 5],
        [
          { node: Digit, value: '5', range: [0, 1] },
          { node: Letter, value: 'a', range: [2, 3] },
        ],
        [mkByteSeqAST(CommaSep, ',', [1, 2]), mkByteSeqAST(CommaSep, ',', [4, 5])],
      ),
      expected_error: false,
    },
    {
      id: 113,
      seq: Seq_DigitCommaLetter_IgnoreLetter,
      input: { src: '5x,a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitCommaLetter_IgnoreLetter,
        [0, 4],
        [
          { node: Digit, value: '5', range: [0, 1] },
          { node: Letter, value: 'a', range: [3, 4] },
        ],
        [mkByteSeqAST(CommaSep, ',', [2, 3])],
      ),
      expected_error: false,
    },
    {
      id: 114,
      seq: Seq_DigitStarLetterStar_Comma_IgnoreSpace,
      input: { src: '', pos: 0 },
      expected: mkSeqAST(Seq_DigitStarLetterStar_Comma_IgnoreSpace, [0, 0], [[], []], []),
      expected_error: false,
    },
    {
      id: 115,
      seq: Seq_DigitStarLetterStar_Comma_IgnoreSpace,
      input: { src: ' a', pos: 0 },
      expected: mkSeqAST(
        Seq_DigitStarLetterStar_Comma_IgnoreSpace,
        [0, 2],
        [[], [{ node: Letter, value: 'a', range: [1, 2] }]],
        [],
      ),
      expected_error: false,
    },
    {
      id: 116,
      seq: Seq_DigitCommaLetter_IgnoreSpace,
      input: { src: '5 ', pos: 0 },
      expected: null,
      expected_error: true,
    },
  ];

  // Merge all test cases
  const cases: TestCase[] = [
    ...cases_basic,
    ...cases_optional,
    ...cases_star,
    ...cases_plus,
    ...cases_triple,
    ...cases_mixed,
    ...cases_empty,
    ...cases_star_mandatory,
    ...cases_plus_mandatory,
    ...cases_optional_plus,
    ...cases_star_plus,
    ...cases_plus_plus,
    ...cases_unicode_emoji,
    ...cases_unicode_chinese,
    ...cases_unicode_emoji_letter,
    ...cases_nonzero_pos,
    ...cases_long,
    ...cases_mid_failure,
    ...cases_empty_string,
    ...cases_optional_optional,
    ...cases_star_star,
    ...cases_optional_star,
    ...cases_ignore,
    ...cases_sep,
    ...cases_sep_last_sep_end,
    ...cases_sep_with_ignore,
  ];
  for (const c of cases) {
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse(c.input);
    const result = parser.parsePatternSeq(c.seq);
    if (!parser.isSuccess()) {
      if (c.expected_error !== (parser.getError() !== null)) {
        throw new Error(`[case ${c.id}] expected_error=${c.expected_error}, last_error=${parser.getError()}`);
      }
      continue;
    }
    if (c.expected === null) {
      if (result !== null) {
        throw new Error(`[case ${c.id}] expected null, got result`);
      }
    } else {
      if (result === null) {
        throw new Error(`[case ${c.id}] expected ASTNode, got null`);
      }
      // Use deep comparison to validate the entire ASTNode structure
      try {
        assert.deepStrictEqual(result, c.expected);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        const printOpts = { depth: null as number | null, maxArrayLength: null as number | null };
        throw new Error(
          `[case ${c.id}] ASTNode mismatch: ${detail}\n-- result --\n${inspect(result, printOpts)}\n-- expected --\n${inspect(c.expected, printOpts)}`,
        );
      }
    }
  }
}

function runAllTests(): void {
  console.log('Running parsePatternSeq tests...\n');
  test_parsePatternSeq();
  console.log('\nAll parsePatternSeq tests passed!');
}

if (require.main === module) {
  runAllTests();
}
