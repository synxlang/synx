import { mkParser, ParserConfig, ParserInput, ParseResult } from '../src/parser';
import type { ParserNode } from '../src/parser_node';
import { Symbol } from '../src/synx_parser_node';
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

function runAllTests(): void {
  console.log('Running Symbol parser tests...\n');
  test_parser();
  console.log('\nAll Symbol parser tests passed!');
}

if (require.main === module) {
  runAllTests();
}
