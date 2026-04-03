import { mkParser, ParserConfig, ParserInput, ParseResult, ASTNode } from '../../src/parser';
import type { ParserNode } from '../../src/parser_node';
import { Symbol, Letter, SymbolChar } from '../../src/synx_parser_node';
import assert from 'assert';

/** parse (Symbol and other entry points): multiple (config, input, root, expected) cases, iterate through test cases and assert within function */
function test_parser(): void {
  const config: ParserConfig = { parser_nodes: [Symbol] };
  const cases: Array<{
    input: ParserInput;
    root: ParserNode;
    expected: ParseResult;
  }> = [
    // TODO: single letter, letter+digit, multiple characters, underscore prefix, digit prefix, empty input, containing spaces, non-zero pos, etc.
  ];

  for (const c of cases) {
    const parser = mkParser(config);
    const result = parser.parse(c.input, c.root);
    assert.strictEqual(result.kind, c.expected.kind);
    assert.strictEqual(result.end_pos, c.expected.end_pos);
    assert.deepStrictEqual(result.ast_nodes, c.expected.ast_nodes);
  }
}

function test_parseAll(): void {
  const config: ParserConfig = { parser_nodes: [Symbol] };
  const cases: Array<{
    id: number;
    input: ParserInput;
    node: ParserNode;
    expected: ASTNode[];
  }> = [
    { id: 1, input: { src: '', pos: 0 }, node: Symbol, expected: [] },
    { id: 2, input: { src: 'abc', pos: 0 }, node: Symbol, expected: [
      { parser_nodes: [Symbol], range: [0, 3], value: 'abc', raw_value: [
        { parser_nodes: [Letter], range: [0, 1], value: 'a', raw_value: 'a' },
        [ { parser_nodes: [SymbolChar], range: [1, 3], value: 'bc', raw_value: 'bc' } ],
      ] },
    ] },
    { id: 3, input: { src: 'a', pos: 0 }, node: Symbol, expected: [
      { parser_nodes: [Symbol], range: [0, 1], value: 'a', raw_value: [
        { parser_nodes: [Letter], range: [0, 1], value: 'a', raw_value: 'a' },
      ] },
    ] },
    { id: 4, input: { src: 'abc def', pos: 0 }, node: Symbol, expected: [
      { parser_nodes: [Symbol], range: [0, 3], value: 'abc', raw_value: [
        { parser_nodes: [Letter], range: [0, 1], value: 'a', raw_value: 'a' },
        [ { parser_nodes: [SymbolChar], range: [1, 3], value: 'bc', raw_value: 'bc' } ],
      ] },
      { parser_nodes: [Symbol], range: [4, 7], value: 'def', raw_value: [
        { parser_nodes: [Letter], range: [4, 5], value: 'd', raw_value: 'd' },
        [ { parser_nodes: [SymbolChar], range: [5, 7], value: 'ef', raw_value: 'ef' } ],
      ] },
    ] },
  ];

  for (const c of cases) {
    const parser = mkParser(config);
    const results = parser.parseAll(c.input, c.node);
    assert.deepStrictEqual(results, c.expected, `case ${c.id} failed`);
  }
}

function runAllTests(): void {
  console.log('Running Symbol parser tests...\n');
  test_parser();
  test_parseAll();
  console.log('\nAll Symbol parser tests passed!');
}

if (require.main === module) {
  runAllTests();
}
