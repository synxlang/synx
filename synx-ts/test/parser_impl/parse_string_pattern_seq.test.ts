import { ParserImpl } from '../../src/parser_impl';
import { mkCharRange, mkCharSet, mkPatternSeq, mkStringPatternSeq } from '../../src/parser_node';
import type { Quantifier } from '../../src/parser_node';
import type { ASTNode, ParserInput } from '../../src/parser';
import { ParserNodeKind } from '../../src/parser_node';
import { strict as assert } from 'assert';

/** parseStringPatternSeq: single match only; no setError, no quantifier */
function test_parseStringPatternSeq(): void {
  const cases: Array<{
    id: number;
    literal: string;
    input: ParserInput;
    expected_value: string | null;
  }> = [
    { id: 1, literal: 'hi', input: { src: 'hi', pos: 0 }, expected_value: 'hi' },
    { id: 2, literal: 'hi', input: { src: 'ha', pos: 0 }, expected_value: null },
    { id: 3, literal: '5😀', input: { src: '5😀z', pos: 0 }, expected_value: '5😀' },
  ];
  for (const c of cases) {
    const node = mkStringPatternSeq(c.literal);
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse(c.input);
    const result = parser.parseStringPatternSeq(node);
    if (c.expected_value === null) {
      if (result !== null) {
        throw new Error(`[case ${c.id}] expected null, got ${(result as ASTNode).value}`);
      }
    } else {
      if (result === null) {
        throw new Error(`[case ${c.id}] expected value, got null`);
      }
      if (result.value !== c.expected_value) {
        throw new Error(`[case ${c.id}] expected value ${JSON.stringify(c.expected_value)}, got ${JSON.stringify(result.value)}`);
      }
      if (result.parser_nodes[0]!.kind !== ParserNodeKind.StringPatternSeq) {
        throw new Error(`[case ${c.id}] wrong parser node kind`);
      }
    }
    if (parser.last_error !== null) {
      throw new Error(`[case ${c.id}] parseStringPatternSeq must not set last_error, got ${parser.last_error}`);
    }
  }
}

/** Quantifiers for StringPatternSeq live in parseNode (same structure as PatternSeq) */
function test_parseNode_stringPatternSeq_quantifiers(): void {
  const ab = mkStringPatternSeq('ab');
  const cases: Array<{
    id: number;
    quantifier: Quantifier;
    input: ParserInput;
    expected_values: string[] | null;
    expected_error: boolean;
  }> = [
    { id: 10, quantifier: ' ', input: { src: 'ab', pos: 0 }, expected_values: ['ab'], expected_error: false },
    { id: 11, quantifier: ' ', input: { src: 'xx', pos: 0 }, expected_values: null, expected_error: true },
    { id: 12, quantifier: '?', input: { src: 'xx', pos: 0 }, expected_values: [], expected_error: false },
    { id: 13, quantifier: '?', input: { src: 'ab', pos: 0 }, expected_values: ['ab'], expected_error: false },
    { id: 14, quantifier: '*', input: { src: 'xx', pos: 0 }, expected_values: [], expected_error: false },
    { id: 15, quantifier: '*', input: { src: 'abab', pos: 0 }, expected_values: ['ab', 'ab'], expected_error: false },
    { id: 16, quantifier: '+', input: { src: 'xx', pos: 0 }, expected_values: null, expected_error: true },
    { id: 17, quantifier: '+', input: { src: 'abab', pos: 0 }, expected_values: ['ab', 'ab'], expected_error: false },
  ];
  for (const c of cases) {
    const parser = new ParserImpl({ parser_nodes: [] });
    parser.initParse(c.input);
    const nodes = parser.parseNode(ab, c.quantifier);
    if (c.expected_values === null) {
      if (nodes.length !== 0) {
        throw new Error(`[case ${c.id}] expected 0 nodes, got ${nodes.length}`);
      }
    } else {
      if (nodes.length !== c.expected_values.length) {
        throw new Error(`[case ${c.id}] expected ${c.expected_values.length} nodes, got ${nodes.length}`);
      }
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i]!.value !== c.expected_values[i]) {
          throw new Error(`[case ${c.id}] node ${i} value mismatch`);
        }
      }
    }
    if (c.expected_error !== (parser.last_error !== null)) {
      throw new Error(`[case ${c.id}] expected_error=${c.expected_error}, last_error=${parser.last_error}`);
    }
  }
}

/** StringPatternSeq as a child of PatternSeq (e.g. synx `=>` before a symbol) */
function test_parsePatternSeq_embedsStringPatternSeq(): void {
  const lit = mkStringPatternSeq('=>');
  const letter = mkCharSet([mkCharRange('a', 'z')]);
  const seq = mkPatternSeq([lit, letter], '  ');
  const parser = new ParserImpl({ parser_nodes: [] });
  parser.initParse({ src: '=>b', pos: 0 });
  const result = parser.parsePatternSeq(seq);
  assert(result !== null);
  assert.deepStrictEqual(result, {
    parser_nodes: [seq],
    range: [0, 3],
    value: [
      {
        parser_nodes: [lit],
        range: [0, 2],
        value: '=>',
        raw_value: '=>',
      },
      {
        parser_nodes: [letter],
        range: [2, 3],
        value: 'b',
        raw_value: 'b',
      },
    ],
    raw_value: [
      {
        parser_nodes: [lit],
        range: [0, 2],
        value: '=>',
        raw_value: '=>',
      },
      {
        parser_nodes: [letter],
        range: [2, 3],
        value: 'b',
        raw_value: 'b',
      },
    ],
  });
  assert.strictEqual(parser.last_error, null);
}

function runAllTests(): void {
  console.log('Running parseStringPatternSeq tests...\n');
  test_parseStringPatternSeq();
  test_parseNode_stringPatternSeq_quantifiers();
  test_parsePatternSeq_embedsStringPatternSeq();
  console.log('\nAll parseStringPatternSeq tests passed!');
}

if (require.main === module) {
  runAllTests();
}
