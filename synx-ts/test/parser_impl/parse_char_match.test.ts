import { ParserImpl } from '../../src/parser_impl';
import { mkCharRange, mkCharSet, AnyChar } from '../../src/parser_node';
import type { CharMatchNode, Quantifier } from '../../src/parser_node';
import type { ASTNode, ParserInput } from '../../src/parser';

/** parseCharMatchNode: multiple inputs covering quantifiers ' ' / '?' / '*' / '+' and match/no-match scenarios */
function test_parseCharMatchNode(): void {
  const Digit: CharMatchNode = mkCharRange('0', '9');
  const cases: Array<{
    id: number;
    node: CharMatchNode;
    quantifier: Quantifier;
    input: ParserInput;
    expected_value: string | null;
    expected_error: boolean;
  }> = [
    { id: 1, node: Digit, quantifier: ' ', input: { src: '5', pos: 0 }, expected_value: '5', expected_error: false },
    { id: 2, node: Digit, quantifier: ' ', input: { src: 'a', pos: 0 }, expected_value: null, expected_error: true },
    { id: 3, node: Digit, quantifier: '?', input: { src: 'a', pos: 0 }, expected_value: null, expected_error: false },
    { id: 4, node: Digit, quantifier: '?', input: { src: '5', pos: 0 }, expected_value: '5', expected_error: false },
    { id: 5, node: Digit, quantifier: '*', input: { src: 'a', pos: 0 }, expected_value: null, expected_error: false },
    { id: 6, node: Digit, quantifier: '*', input: { src: '123', pos: 0 }, expected_value: '123', expected_error: false },
    { id: 7, node: Digit, quantifier: '+', input: { src: 'a', pos: 0 }, expected_value: null, expected_error: true },
    { id: 8, node: Digit, quantifier: '+', input: { src: '12', pos: 0 }, expected_value: '12', expected_error: false },
    { id: 9, node: mkCharSet('😀'), quantifier: ' ', input: { src: '😀', pos: 0 }, expected_value: '😀', expected_error: false },
    { id: 10, node: mkCharRange('😀', '😀'), quantifier: ' ', input: { src: '😀', pos: 0 }, expected_value: '😀', expected_error: false },
    // AnyChar test cases
    { id: 11, node: AnyChar, quantifier: ' ', input: { src: 'a', pos: 0 }, expected_value: 'a', expected_error: false },
    { id: 12, node: AnyChar, quantifier: ' ', input: { src: '5', pos: 0 }, expected_value: '5', expected_error: false },
    { id: 13, node: AnyChar, quantifier: ' ', input: { src: '😀', pos: 0 }, expected_value: '😀', expected_error: false },
    { id: 14, node: AnyChar, quantifier: ' ', input: { src: '中', pos: 0 }, expected_value: '中', expected_error: false },
    { id: 15, node: AnyChar, quantifier: ' ', input: { src: '', pos: 0 }, expected_value: null, expected_error: true },
    { id: 16, node: AnyChar, quantifier: '?', input: { src: '', pos: 0 }, expected_value: null, expected_error: false },
    { id: 17, node: AnyChar, quantifier: '*', input: { src: 'abc', pos: 0 }, expected_value: 'abc', expected_error: false },
    { id: 18, node: AnyChar, quantifier: '+', input: { src: 'xyz', pos: 0 }, expected_value: 'xyz', expected_error: false },
    { id: 19, node: AnyChar, quantifier: '*', input: { src: '', pos: 0 }, expected_value: null, expected_error: false },
    { id: 20, node: AnyChar, quantifier: '+', input: { src: '', pos: 0 }, expected_value: null, expected_error: true },
  ];
  for (const c of cases) {
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse(c.input);
    const result = parser.parseCharMatchNode(c.node, c.quantifier);
    if (!parser.isSuccess()) {
      if (c.expected_error !== (parser.getError() !== null)) {
        throw new Error(`[case ${c.id}] expected_error=${c.expected_error}, last_error=${parser.getError()}`);
      }
      continue;
    }
    if (c.expected_value === null) {
      if (result !== null) throw new Error(`[case ${c.id}] expected null, got value ${(result as ASTNode).value}`);
    } else {
      if (result === null) throw new Error(`[case ${c.id}] expected value "${c.expected_value}", got null`);
      if (result.value !== c.expected_value) throw new Error(`[case ${c.id}] expected value "${c.expected_value}", got "${result.value}"`);
    }
  }
}

function runAllTests(): void {
  console.log('Running parseCharMatchNode tests...\n');
  test_parseCharMatchNode();
  console.log('\nAll parseCharMatchNode tests passed!');
}

if (require.main === module) {
  runAllTests();
}
