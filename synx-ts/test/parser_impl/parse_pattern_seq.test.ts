import { ParserImpl } from '../../src/parser_impl';
import { mkCharRange, mkCharSet, mkPatternSeq } from '../../src/parser_node';
import type { CharMatchNode, PatternSeq } from '../../src/parser_node';
import type { ASTNode, ParserInput } from '../../src/parser';
import { strict as assert } from 'assert';

// Basic node constants
const Digit: CharMatchNode = mkCharRange('0', '9');
const Letter: CharMatchNode = mkCharSet([mkCharRange('a', 'z')]);
const Emoji: CharMatchNode = mkCharSet('😀'); // emoji is a multi-code-unit character
const Chinese: CharMatchNode = mkCharSet('中'); // Chinese character

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

/** Helper function: construct child node ASTNode */
function mkChildAST(node: CharMatchNode, value: string, range: [number, number]): ASTNode {
  return {
    parser_nodes: [node],
    range,
    value,
    raw_value: value,
  };
}

type LeafDesc = { node: CharMatchNode; value: string; range: [number, number] };
/** `*` / `+` sub-node: one slot is `LeafDesc[]` (not flattened into the seq). */
type SeqPart = ASTNode | LeafDesc | LeafDesc[];

function normalizeSeqPart(p: SeqPart): ASTNode | ASTNode[] {
  if (Array.isArray(p)) {
    return p.map((x) => mkChildAST(x.node, x.value, x.range));
  }
  if (p && typeof p === "object" && "parser_nodes" in p) {
    return p as ASTNode;
  }
  return mkChildAST((p as LeafDesc).node, (p as LeafDesc).value, (p as LeafDesc).range);
}

/** Helper: construct sequence ASTNode (`value` / `raw_value` mirror parser output). */
function mkSeqAST(seq: PatternSeq, range: [number, number], parts: SeqPart[]): ASTNode {
  const normalized = parts.map(normalizeSeqPart);
  return {
    parser_nodes: [seq],
    range,
    value: normalized,
    raw_value: normalized,
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
      ]),
      expected_error: false,
    },
    {
      id: 9,
      seq: Seq_Digit_Letter_Star,
      input: { src: '5a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Star, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        [{ node: Letter, value: 'a', range: [1, 2] }],
      ]),
      expected_error: false,
    },
    {
      id: 10,
      seq: Seq_Digit_Letter_Star,
      input: { src: '5abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Star, [0, 4], [
        { node: Digit, value: '5', range: [0, 1] },
        [{ node: Letter, value: 'abc', range: [1, 4] }],
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
        [{ node: Letter, value: 'a', range: [1, 2] }],
      ]),
      expected_error: false,
    },
    {
      id: 13,
      seq: Seq_Digit_Letter_Plus,
      input: { src: '5abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Letter_Plus, [0, 4], [
        { node: Digit, value: '5', range: [0, 1] },
        [{ node: Letter, value: 'abc', range: [1, 4] }],
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
        { node: Letter, value: 'a', range: [0, 1] },
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
        [{ node: Digit, value: '123', range: [2, 5] }],
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
        { node: Digit, value: '5', range: [0, 1] },
      ]),
      expected_error: false,
    },
    {
      id: 23,
      seq: Seq_Letter_Star_Digit_Mandatory,
      input: { src: 'a5', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Star_Digit_Mandatory, [0, 2], [
        [{ node: Letter, value: 'a', range: [0, 1] }],
        { node: Digit, value: '5', range: [1, 2] },
      ]),
      expected_error: false,
    },
    {
      id: 24,
      seq: Seq_Letter_Star_Digit_Mandatory,
      input: { src: 'abc5', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Star_Digit_Mandatory, [0, 4], [
        [{ node: Letter, value: 'abc', range: [0, 3] }],
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
        [{ node: Letter, value: 'a', range: [0, 1] }],
        { node: Digit, value: '5', range: [1, 2] },
      ]),
      expected_error: false,
    },
    {
      id: 27,
      seq: Seq_Letter_Plus_Digit_Mandatory,
      input: { src: 'abc5', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Plus_Digit_Mandatory, [0, 4], [
        [{ node: Letter, value: 'abc', range: [0, 3] }],
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
        [{ node: Letter, value: 'a', range: [0, 1] }],
      ]),
      expected_error: false,
    },
    {
      id: 30,
      seq: Seq_Digit_Optional_Letter_Plus,
      input: { src: '5a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Letter_Plus, [0, 2], [
        { node: Digit, value: '5', range: [0, 1] },
        [{ node: Letter, value: 'a', range: [1, 2] }],
      ]),
      expected_error: false,
    },
    {
      id: 31,
      seq: Seq_Digit_Optional_Letter_Plus,
      input: { src: '5abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Letter_Plus, [0, 4], [
        { node: Digit, value: '5', range: [0, 1] },
        [{ node: Letter, value: 'abc', range: [1, 4] }],
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
        [{ node: Letter, value: 'a', range: [0, 1] }],
      ]),
      expected_error: false,
    },
    {
      id: 34,
      seq: Seq_Digit_Star_Letter_Plus,
      input: { src: '5a', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Star_Letter_Plus, [0, 2], [
        [{ node: Digit, value: '5', range: [0, 1] }],
        [{ node: Letter, value: 'a', range: [1, 2] }],
      ]),
      expected_error: false,
    },
    {
      id: 35,
      seq: Seq_Digit_Star_Letter_Plus,
      input: { src: '123abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Star_Letter_Plus, [0, 6], [
        [{ node: Digit, value: '123', range: [0, 3] }],
        [{ node: Letter, value: 'abc', range: [3, 6] }],
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
      expected: mkSeqAST(Seq_Digit_Optional_Optional, [0, 0], []),
      expected_error: false,
    },
    {
      id: 62,
      seq: Seq_Digit_Optional_Optional,
      input: { src: '5', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Optional, [0, 1], [
        { node: Digit, value: '5', range: [0, 1] },
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
      expected: mkSeqAST(Seq_Letter_Star_Star, [0, 0], []),
      expected_error: false,
    },
    {
      id: 65,
      seq: Seq_Letter_Star_Star,
      input: { src: 'a', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Star_Star, [0, 1], [
        [{ node: Letter, value: 'a', range: [0, 1] }],
      ]),
      expected_error: false,
    },
    {
      id: 66,
      seq: Seq_Letter_Star_Star,
      input: { src: 'ab', pos: 0 },
      expected: mkSeqAST(Seq_Letter_Star_Star, [0, 2], [
        [{ node: Letter, value: 'ab', range: [0, 2] }],
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
      expected: mkSeqAST(Seq_Digit_Optional_Star, [0, 0], []),
      expected_error: false,
    },
    {
      id: 68,
      seq: Seq_Digit_Optional_Star,
      input: { src: '5', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Star, [0, 1], [
        { node: Digit, value: '5', range: [0, 1] },
      ]),
      expected_error: false,
    },
    {
      id: 69,
      seq: Seq_Digit_Optional_Star,
      input: { src: 'abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Star, [0, 3], [
        [{ node: Letter, value: 'abc', range: [0, 3] }],
      ]),
      expected_error: false,
    },
    {
      id: 70,
      seq: Seq_Digit_Optional_Star,
      input: { src: '5abc', pos: 0 },
      expected: mkSeqAST(Seq_Digit_Optional_Star, [0, 4], [
        { node: Digit, value: '5', range: [0, 1] },
        [{ node: Letter, value: 'abc', range: [1, 4] }],
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
        [{ node: Letter, value: 'abc', range: [2, 5] }],
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
        { node: Letter, value: 'a', range: [0, 1] },
        [{ node: Digit, value: '3', range: [1, 2] }],
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
        [{ node: Digit, value: '123', range: [2, 5] }],
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
  ];
  for (const c of cases) {
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse(c.input);
    const result = parser.parsePatternSeq(c.seq);
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
        throw new Error(`[case ${c.id}] ASTNode mismatch: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (c.expected_error !== (parser.getError() !== null)) {
      throw new Error(`[case ${c.id}] expected_error=${c.expected_error}, last_error=${parser.getError()}`);
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
