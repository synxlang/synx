import { strict as assert } from "assert";
import { inspect } from "node:util";
import { ParserImpl } from "../../../src/parser_impl";
import type { ASTNode, ParserInput } from "../../../src/parser";
import {
  AnyChar,
  mkByteSeq,
  mkCharRange,
  mkCharSet,
  mkPatternSeq,
  type ByteSeq,
  type CharMatchNode,
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
const Digit: CharMatchNode = mkCharRange("0", "9");

const Seq_A_star_B_mandatory_nongreedy = mkPatternSeq([A, B], "* ", false, null, false, null, [false, true]);
const Seq_A_q_B_q_C_mandatory = mkPatternSeq([A, B, C], "?? ", false, null, false, null, [false, false, true]);
const Seq_A_star_B_star_C_mandatory = mkPatternSeq([A, B, C], "** ", false, null, false, null, [false, false, true]);
const Seq_A_star_B_plus_C_mandatory = mkPatternSeq([A, B, C], "*+ ", false, null, false, null, [false, false, true]);
const Seq_A_plus_Five_mandatory_comma = mkPatternSeq([A, Five], "+ ", false, Comma, false, null, [false, true]);
const Seq_A_star_B_mandatory_ignoreSpace = mkPatternSeq([A, B], "* ", false, null, false, Space as ParserNode, [false, true]);
const Seq_AnyChar_star_Bang = mkPatternSeq([AnyChar, Bang], "* ");
const Seq_AnyChar_plus_Bang = mkPatternSeq([AnyChar, Bang], "+ ");
const Seq_AnyChar_star_Digit = mkPatternSeq([AnyChar, Digit], "* ");

function mkByteSeqAST(n: ByteSeq, value: string, range: [number, number]): ASTNode {
  return {
    parser_nodes: [n],
    range,
    value,
    raw_value: value,
    seps: [],
  };
}

function mkCharRangeAST(n: CharMatchNode, value: string, range: [number, number]): ASTNode {
  return {
    parser_nodes: [n],
    range,
    value,
    raw_value: value,
    seps: [],
  };
}

function mkAnyCharAST(value: string, range: [number, number]): ASTNode {
  return {
    parser_nodes: [AnyChar],
    range,
    value,
    raw_value: value,
    seps: [],
  };
}

function mkSeqAST(seq: PatternSeq, range: [number, number], parts: (ASTNode | ASTNode[] | null)[], seps: ASTNode[] = []): ASTNode {
  return {
    parser_nodes: [seq],
    range,
    value: parts,
    raw_value: parts,
    seps,
  };
}

type NongreedyCase = {
  id: number;
  name: string;
  seq: PatternSeq;
  input: ParserInput;
  expected: ASTNode | null;
  expected_error: boolean;
};

/** Non-greedy `ends`, explicit `greedy_flags`, and `AnyChar` default non-greedy (`parsePatternSeq`). */
function test_parsePatternSeq_nongreedy(): void {
  const cases: NongreedyCase[] = [
    {
      id: 1,
      name: "ByteSeq * non-greedy stops before mandatory B",
      seq: Seq_A_star_B_mandatory_nongreedy,
      input: { src: "aaabtail", pos: 0 },
      expected: mkSeqAST(Seq_A_star_B_mandatory_nongreedy, [0, 4], [
        [mkByteSeqAST(A, "a", [0, 1]), mkByteSeqAST(A, "a", [1, 2]), mkByteSeqAST(A, "a", [2, 3])],
        mkByteSeqAST(B, "b", [3, 4]),
      ]),
      expected_error: false,
    },
    {
      id: 2,
      name: "Consecutive ?? non-greedy: skip to final mandatory C",
      seq: Seq_A_q_B_q_C_mandatory,
      input: { src: "c", pos: 0 },
      expected: mkSeqAST(Seq_A_q_B_q_C_mandatory, [0, 1], [null, null, mkByteSeqAST(C, "c", [0, 1])]),
      expected_error: false,
    },
    {
      id: 3,
      name: "Consecutive ** non-greedy: A* then empty B* then C",
      seq: Seq_A_star_B_star_C_mandatory,
      input: { src: "aaac", pos: 0 },
      expected: mkSeqAST(Seq_A_star_B_star_C_mandatory, [0, 4], [
        [mkByteSeqAST(A, "a", [0, 1]), mkByteSeqAST(A, "a", [1, 2]), mkByteSeqAST(A, "a", [2, 3])],
        [],
        mkByteSeqAST(C, "c", [3, 4]),
      ]),
      expected_error: false,
    },
    {
      id: 4,
      name: "+ breaks non-greedy chain but B+ is still end for A*",
      seq: Seq_A_star_B_plus_C_mandatory,
      input: { src: "aaabbc", pos: 0 },
      expected: mkSeqAST(Seq_A_star_B_plus_C_mandatory, [0, 6], [
        [mkByteSeqAST(A, "a", [0, 1]), mkByteSeqAST(A, "a", [1, 2]), mkByteSeqAST(A, "a", [2, 3])],
        [mkByteSeqAST(B, "b", [3, 4]), mkByteSeqAST(B, "b", [4, 5])],
        mkByteSeqAST(C, "c", [5, 6]),
      ]),
      expected_error: false,
    },
    {
      id: 5,
      name: "sep + non-greedy +: second comma reserved for inter-child sep",
      seq: Seq_A_plus_Five_mandatory_comma,
      input: { src: "a,a,5", pos: 0 },
      expected: mkSeqAST(
        Seq_A_plus_Five_mandatory_comma,
        [0, 5],
        [[mkByteSeqAST(A, "a", [0, 1]), mkByteSeqAST(A, "a", [2, 3])], mkByteSeqAST(Five, "5", [4, 5])],
        [mkByteSeqAST(Comma, ",", [1, 2]), mkByteSeqAST(Comma, ",", [3, 4])],
      ),
      expected_error: false,
    },
    {
      id: 6,
      name: "ignore Space + non-greedy A*: spaces then B",
      seq: Seq_A_star_B_mandatory_ignoreSpace,
      input: { src: "aaa   b", pos: 0 },
      expected: mkSeqAST(Seq_A_star_B_mandatory_ignoreSpace, [0, 7], [
        [mkByteSeqAST(A, "a", [0, 1]), mkByteSeqAST(A, "a", [1, 2]), mkByteSeqAST(A, "a", [2, 3])],
        mkByteSeqAST(B, "b", [6, 7]),
      ]),
      expected_error: false,
    },
    {
      id: 7,
      name: "AnyChar * default non-greedy: zero matches before Bang",
      seq: Seq_AnyChar_star_Bang,
      input: { src: "!", pos: 0 },
      expected: mkSeqAST(Seq_AnyChar_star_Bang, [0, 1], [[], mkByteSeqAST(Bang, "!", [0, 1])]),
      expected_error: false,
    },
    {
      id: 8,
      name: "AnyChar * default non-greedy: stops before Bang",
      seq: Seq_AnyChar_star_Bang,
      input: { src: "abc!tail", pos: 0 },
      expected: mkSeqAST(Seq_AnyChar_star_Bang, [0, 4], [[mkAnyCharAST("abc", [0, 3])], mkByteSeqAST(Bang, "!", [3, 4])]),
      expected_error: false,
    },
    {
      id: 9,
      name: "AnyChar + default non-greedy: one char then Bang",
      seq: Seq_AnyChar_plus_Bang,
      input: { src: "x!", pos: 0 },
      expected: mkSeqAST(Seq_AnyChar_plus_Bang, [0, 2], [[mkAnyCharAST("x", [0, 1])], mkByteSeqAST(Bang, "!", [1, 2])]),
      expected_error: false,
    },
    {
      id: 10,
      name: "AnyChar * with Digit end",
      seq: Seq_AnyChar_star_Digit,
      input: { src: "abc1rest", pos: 0 },
      expected: mkSeqAST(Seq_AnyChar_star_Digit, [0, 4], [[mkAnyCharAST("abc", [0, 3])], mkCharRangeAST(Digit, "1", [3, 4])]),
      expected_error: false,
    },
  ];

  for (const c of cases) {
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse(c.input);
    const result = parser.parsePatternSeq(c.seq);
    if (!parser.isSuccess()) {
      if (c.expected_error !== (parser.getError() !== null)) {
        throw new Error(`[${c.id} ${c.name}] expected_error=${c.expected_error}, error=${parser.getError()}`);
      }
      if (c.expected !== null) {
        throw new Error(`[${c.id} ${c.name}] expected AST but parse failed`);
      }
      continue;
    }
    if (c.expected === null) {
      throw new Error(`[${c.id} ${c.name}] unexpected success`);
    }
    if (result === null) {
      throw new Error(`[${c.id} ${c.name}] expected AST, got null`);
    }
    try {
      assert.deepStrictEqual(result, c.expected);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const printOpts = { depth: null as number | null, maxArrayLength: null as number | null };
      throw new Error(
        `[${c.id} ${c.name}] mismatch: ${detail}\n-- got --\n${inspect(result, printOpts)}\n-- expected --\n${inspect(c.expected, printOpts)}`,
      );
    }
  }
}

function runAllTests(): void {
  console.log("Running parsePatternSeq non-greedy tests...\n");
  test_parsePatternSeq_nongreedy();
  console.log("\nAll parsePatternSeq non-greedy tests passed!");
}

if (require.main === module) {
  runAllTests();
}
