import { ParserImpl } from '../../../src/parser_impl';
import { mkByteSeq, mkCharRange, mkCharSet } from '../../../src/parser_node';
import type { CharMatchNode, ParserNode, Quantifier } from '../../../src/parser_node';
import type { ParserInput } from '../../../src/parser';
import type { ASTNode } from '../../../src/parser';

function parse_node_result_count(parse_res: ASTNode[] | ASTNode | null): number {
  if (parse_res === null) return 0;
  if (Array.isArray(parse_res)) return parse_res.length;
  return 1;
}

/** parseNode: multiple inputs covering character nodes, PatternSeq, and ByteSeq */
function test_parseNode(): void {
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
    const nodes = parser.parseNode(c.node, c.quantifier);
    if (!parser.isSuccess()) {
      if (c.expected_error !== (parser.getError() !== null)) {
        throw new Error(`[case ${c.id}] expected_error=${c.expected_error}, last_error=${parser.getError()}`);
      }
      continue;
    }
    const got_count = parse_node_result_count(nodes);
    if (got_count !== c.expected_count) {
      throw new Error(`[case ${c.id}] expected ${c.expected_count} nodes, got ${got_count}`);
    }
  }
}

function runAllTests(): void {
  console.log('Running parseNode tests...\n');
  test_parseNode();
  console.log('\nAll parseNode tests passed!');
}

if (require.main === module) {
  runAllTests();
}
