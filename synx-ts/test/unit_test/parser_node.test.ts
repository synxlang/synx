import { strict as assert } from "assert";
import {
  completeCharRange,
  completeCharSeq,
  completeCharSet,
  completePatternSeq,
  completePatternSet,
  ParserNodeKind,
} from "../../src/parser_node";

function test_complete_functions_mutate_input(): void {
  const rangePartial = { start: "0", end: "9" };
  const range = completeCharRange(rangePartial);
  assert.strictEqual(range, rangePartial);
  assert.strictEqual(range.name, "");

  const setPartial = { sub_nodes: "abc" };
  const set = completeCharSet(setPartial);
  assert.strictEqual(set, setPartial);
  assert.strictEqual(set.name, "");

  const literalPartial = { literal: "x" };
  const literal = completeCharSeq(literalPartial);
  assert.strictEqual(literal, literalPartial);
  assert.strictEqual(literal.name, "");

  const seqPartial = { sub_nodes: [literal], sub_quantifiers: " " };
  const seq = completePatternSeq(seqPartial);
  assert.strictEqual(seq, seqPartial);
  assert.strictEqual(seq.name, "");

  const patternSetPartial = { sub_nodes: [seq] };
  const patternSet = completePatternSet(patternSetPartial);
  assert.strictEqual(patternSet, patternSetPartial);
  assert.strictEqual(patternSet.name, "");
}

function test_completePatternSet_validates_non_empty(): void {
  assert.throws(() => completePatternSet({ sub_nodes: [] }), /sub_nodes must not be empty/);
}

function test_complete_functions_accept_pair_strings(): void {
  const literal = completeCharSeq({ literal: "x" });

  const seq = completePatternSeq({
    sub_nodes: [literal],
    sub_quantifiers: " ",
    enclosure: "[]",
  });
  assert.strictEqual(seq.enclosure?.[0].kind, ParserNodeKind.CharSeq);
  assert.strictEqual(seq.enclosure?.[1].kind, ParserNodeKind.CharSeq);
  assert.strictEqual(seq.enclosure?.[0].literal, "[");
  assert.strictEqual(seq.enclosure?.[1].literal, "]");

  const patternSet = completePatternSet({
    sub_nodes: [literal],
    associateby: "()",
  });
  assert.strictEqual(patternSet.associateby?.[0].kind, ParserNodeKind.CharSeq);
  assert.strictEqual(patternSet.associateby?.[1].kind, ParserNodeKind.CharSeq);
  assert.strictEqual(patternSet.associateby?.[0].literal, "(");
  assert.strictEqual(patternSet.associateby?.[1].literal, ")");

  assert.throws(
    () => completePatternSeq({ sub_nodes: [literal], sub_quantifiers: " ", enclosure: "abc" }),
    /enclosure string must contain exactly 2 characters/,
  );
  assert.throws(
    () => completePatternSet({ sub_nodes: [literal], associateby: "(" }),
    /associateby string must contain exactly 2 characters/,
  );
}

function runAllTests(): void {
  test_complete_functions_mutate_input();
  test_completePatternSet_validates_non_empty();
  test_complete_functions_accept_pair_strings();
  console.log("All parser_node tests passed!");
}

runAllTests();
