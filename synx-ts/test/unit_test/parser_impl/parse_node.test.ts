import { ParserImpl } from '../../../src/parser_impl';
import { mkByteSeq, mkCharRange, mkCharSet, mkPatternSeq } from '../../../src/parser_node';
import type { CharMatchNode, ParserNode, Quantifier } from '../../../src/parser_node';
import type { ParserInput } from '../../../src/parser';
import type { ASTNode } from '../../../src/parser';

function parse_node_result_count(parse_res: ASTNode[] | ASTNode | null): number {
  if (parse_res === null) return 0;
  if (Array.isArray(parse_res)) return parse_res.length;
  return 1;
}

/** First child slot of a non-raw PatternSeq (same payload as `parseNode` would return in `ast_node_res`). */
function firstSlotFromSeqResult(top: ASTNode): ASTNode[] | ASTNode | null {
  const v = top.value;
  if (!Array.isArray(v) || v.length === 0) return null;
  return v[0] as ASTNode[] | ASTNode | null;
}

/** Quantified single-child PatternSeq: same path as `parsePatternSeq` in production (no direct `parseNode` in tests). */
function test_parsePatternSeq_singleSlot_quantifiers(): void {
  const Digit: CharMatchNode = mkCharRange('0', '9');
  const Letter: CharMatchNode = mkCharSet([mkCharRange('a', 'z'), mkCharRange('A', 'Z')]);
  const cases: Array<{
    id: number;
    node: ParserNode;
    quantifier: Quantifier;
    input: ParserInput;
    expected_count: number;
    expected_error: boolean;
  }> = [
    { id: 1, node: Digit, quantifier: ' ', input: { src: '5', pos: 0 }, expected_count: 1, expected_error: false },
    { id: 2, node: Digit, quantifier: ' ', input: { src: 'a', pos: 0 }, expected_count: 0, expected_error: true },
    { id: 3, node: Letter, quantifier: '?', input: { src: 'x', pos: 0 }, expected_count: 1, expected_error: false },
    { id: 5, node: mkByteSeq('=>'), quantifier: ' ', input: { src: '=>y', pos: 0 }, expected_count: 1, expected_error: false },
    { id: 6, node: mkByteSeq('=>'), quantifier: ' ', input: { src: '=y', pos: 0 }, expected_count: 0, expected_error: true },
  ];
  for (const c of cases) {
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse(c.input);
    const seq = mkPatternSeq([c.node], c.quantifier, false, null, false, null);
    const top = parser.parsePatternSeq(seq);
    if (top === null) {
      if (c.expected_error !== (parser.getError() !== null)) {
        throw new Error(`[case ${c.id}] expected_error=${c.expected_error}, last_error=${parser.getError()}`);
      }
      continue;
    }
    const slot = firstSlotFromSeqResult(top);
    const got_count = parse_node_result_count(slot);
    if (got_count !== c.expected_count) {
      throw new Error(`[case ${c.id}] expected ${c.expected_count} nodes, got ${got_count}`);
    }
  }
}

function runAllTests(): void {
  console.log('Running parsePatternSeq single-slot tests...\n');
  test_parsePatternSeq_singleSlot_quantifiers();
  console.log('\nAll parsePatternSeq single-slot tests passed!');
}

if (require.main === module) {
  runAllTests();
}
