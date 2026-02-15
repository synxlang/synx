import { matchChar, mkCharRange, mkCharSet } from '../src/parser_matcher';
import { AnyChar } from '../src/parser_node';
import type { CharMatchNode, CharMatchSet } from '../src/parser_node';
import assert from 'assert';

type Case = { id: number; src: string; match_set: CharMatchSet; expected: { nodes: CharMatchNode[]; new_pos: number }; pos?: number };

function mkCase(id: number, src: string, match_set: CharMatchSet, nodes: CharMatchNode[], new_pos: number, pos = 0): Case {
  return { id, src, match_set, expected: { nodes, new_pos }, pos };
}

/** All nodes defined bottom-up: children first, then parents; test cases only reference these variables */
const DIGIT_RANGE = mkCharRange('0', '9');
const DIGITS = mkCharSet('0123456789');
const AZ_RANGE = mkCharRange('a', 'z');
const AZ_UP = mkCharRange('A', 'Z');
const US = mkCharSet('_');
const NL = mkCharSet('\n');
const CR = mkCharSet('\r');
const EMOJI_RANGE = mkCharRange('😀', '😀');

const DIGIT_SET = mkCharSet([DIGIT_RANGE]);
const AZ_SET = mkCharSet([AZ_RANGE]);
const NESTED_DIGITS = mkCharSet([DIGITS]);
const LETTER_OR_UNDERSCORE = mkCharSet([AZ_RANGE, AZ_UP, US]);
const TRIPLE_L3 = mkCharSet('0123456789');
const TRIPLE_L2 = mkCharSet([TRIPLE_L3]);
const TRIPLE_L1 = mkCharSet([TRIPLE_L2]);
const WHITESPACE = mkCharSet(' \t\v\n');
const SEMICOLON = mkCharSet(';');
const NL_OR_CR = mkCharSet([NL, CR]);
const EMOJI_SET = mkCharSet('😀');
const EMOJI_RANGE_SET = mkCharSet([EMOJI_RANGE]);

/** CJK Unified Ideographs Basic Block: U+4E00 (一) to U+9FFF */
const CJK_RANGE = mkCharRange('\u4E00', '\u9FFF');
const CJK_SET = mkCharSet([CJK_RANGE]);
/** Several Chinese characters in \oneof form */
const CHINESE_SAMPLE = mkCharSet('中文');

/** Character set containing both single-code-unit (a, 中) and double-code-unit (😀) characters */
const MIXED_SINGLE_AND_SURROGATE = mkCharSet('a中😀');

/** Range from 一(U+4E00) to 😀(U+1F600), covering BMP single-code-unit and supplementary plane double-code-unit characters */
const MIXED_RANGE = mkCharRange('\u4E00', '😀');
const MIXED_RANGE_SET = mkCharSet([MIXED_RANGE]);

const DIGIT_OR_LETTER = mkCharSet([DIGITS, AZ_SET]);
const DIGIT_OR_LETTER_R = mkCharSet([LETTER_OR_UNDERSCORE, DIGIT_SET]);

const EMPTY_SET = mkCharSet('');
/** CharSet with empty array as sub_nodes */
const EMPTY_ARRAY_SET = mkCharSet([]);

/** AnyChar as a single child node */
const ANYCHAR_SET = mkCharSet([AnyChar]);
/** AnyChar combined with other nodes - AnyChar placed last as fallback option */
const DIGIT_OR_ANYCHAR = mkCharSet([DIGIT_RANGE, AnyChar]);
const LETTER_OR_ANYCHAR = mkCharSet([AZ_RANGE, AnyChar]);

/** matchChar: multiple inputs and expected results; comments show corresponding CharSet patterns in synx */
function test_match_char(): void {
  const cases: Case[] = [
    // {}
    mkCase(1, '', EMPTY_SET, [], 0),
    // \oneof '0123456789'
    mkCase(2, '5', DIGITS, [DIGITS], 1),
    // \oneof '0123456789'
    mkCase(3, 'a', DIGITS, [], 0),
    // a~z
    mkCase(4, 'm', AZ_SET, [AZ_RANGE, AZ_SET], 1),
    // a~z
    mkCase(5, 'a', AZ_SET, [AZ_RANGE, AZ_SET], 1),
    // a~z
    mkCase(6, 'z', AZ_SET, [AZ_RANGE, AZ_SET], 1),
    // a~z
    mkCase(7, 'A', AZ_SET, [], 0),
    // { \oneof '0123456789' }
    mkCase(8, '5', NESTED_DIGITS, [DIGITS, NESTED_DIGITS], 1),
    // { \oneof '0123456789'; a~z }
    mkCase(9, '5', DIGIT_OR_LETTER, [DIGITS, DIGIT_OR_LETTER], 1),
    // { \oneof '0123456789'; a~z }
    mkCase(10, 'a', DIGIT_OR_LETTER, [AZ_RANGE, AZ_SET, DIGIT_OR_LETTER], 1),
    // { a~z; A~Z; '_' }
    mkCase(11, 'm', LETTER_OR_UNDERSCORE, [AZ_RANGE, LETTER_OR_UNDERSCORE], 1),
    // { a~z; A~Z; '_' }
    mkCase(12, 'M', LETTER_OR_UNDERSCORE, [AZ_UP, LETTER_OR_UNDERSCORE], 1),
    // { a~z; A~Z; '_' }
    mkCase(13, '_', LETTER_OR_UNDERSCORE, [US, LETTER_OR_UNDERSCORE], 1),
    // { a~z; A~Z; '_' }
    mkCase(14, '5', LETTER_OR_UNDERSCORE, [], 0),
    // { { \oneof '0123456789' } }
    mkCase(15, '5', TRIPLE_L1, [TRIPLE_L3, TRIPLE_L2, TRIPLE_L1], 1),
    // \oneof '0123456789'
    mkCase(16, '5abc', DIGITS, [DIGITS], 1),
    // 0~9
    mkCase(17, '0', DIGIT_SET, [DIGIT_RANGE, DIGIT_SET], 1),
    // 0~9
    mkCase(18, '5', DIGIT_SET, [DIGIT_RANGE, DIGIT_SET], 1),
    // 0~9
    mkCase(19, '9', DIGIT_SET, [DIGIT_RANGE, DIGIT_SET], 1),
    // 0~9
    mkCase(20, 'a', DIGIT_SET, [], 0),
    // { a~z; A~Z; '_' }
    mkCase(21, 'a', LETTER_OR_UNDERSCORE, [AZ_RANGE, LETTER_OR_UNDERSCORE], 1),
    // { a~z; A~Z; '_' }
    mkCase(22, 'A', LETTER_OR_UNDERSCORE, [AZ_UP, LETTER_OR_UNDERSCORE], 1),
    // { a~z; A~Z; '_' }
    mkCase(23, '_', LETTER_OR_UNDERSCORE, [US, LETTER_OR_UNDERSCORE], 1),
    // { a~z; A~Z; '_' }
    mkCase(24, '5', LETTER_OR_UNDERSCORE, [], 0),
    // { { a~z; A~Z; '_' }; 0~9 }
    mkCase(25, '5', DIGIT_OR_LETTER_R, [DIGIT_RANGE, DIGIT_SET, DIGIT_OR_LETTER_R], 1),
    // { { a~z; A~Z; '_' }; 0~9 }
    mkCase(26, 'a', DIGIT_OR_LETTER_R, [AZ_RANGE, LETTER_OR_UNDERSCORE, DIGIT_OR_LETTER_R], 1),
    // { { a~z; A~Z; '_' }; 0~9 }
    mkCase(27, '_', DIGIT_OR_LETTER_R, [US, LETTER_OR_UNDERSCORE, DIGIT_OR_LETTER_R], 1),
    // { { a~z; A~Z; '_' }; 0~9 }
    mkCase(28, ' ', DIGIT_OR_LETTER_R, [], 0),
    // \oneof ' \t\v\n'
    mkCase(29, ' ', WHITESPACE, [WHITESPACE], 1),
    // \oneof ' \t\v\n'
    mkCase(30, '\t', WHITESPACE, [WHITESPACE], 1),
    // \oneof ' \t\v\n'
    mkCase(31, '\v', WHITESPACE, [WHITESPACE], 1),
    // \oneof ' \t\v\n'
    mkCase(32, '\n', WHITESPACE, [WHITESPACE], 1),
    // \oneof ' \t\v\n'
    mkCase(33, 'a', WHITESPACE, [], 0),
    // ';'
    mkCase(34, ';', SEMICOLON, [SEMICOLON], 1),
    // ';'
    mkCase(35, ',', SEMICOLON, [], 0),
    // { '\n'; '\r' }
    mkCase(36, '\n', NL_OR_CR, [NL, NL_OR_CR], 1),
    // { '\n'; '\r' }
    mkCase(37, '\r', NL_OR_CR, [CR, NL_OR_CR], 1),
    // { '\n'; '\r' }
    mkCase(38, ' ', NL_OR_CR, [], 0),
    // \oneof '😀'
    mkCase(39, '😀', EMOJI_SET, [EMOJI_SET], 2),
    // 😀~😀
    mkCase(40, '😀', EMOJI_RANGE_SET, [EMOJI_RANGE, EMOJI_RANGE_SET], 2),
    // 一~龯 (CJK Basic Block U+4E00..U+9FFF)
    mkCase(41, '一', CJK_SET, [CJK_RANGE, CJK_SET], 1),
    // 一~龯
    mkCase(42, '中', CJK_SET, [CJK_RANGE, CJK_SET], 1),
    // 一~龯
    mkCase(43, '文', CJK_SET, [CJK_RANGE, CJK_SET], 1),
    // 一~龯
    mkCase(44, '字', CJK_SET, [CJK_RANGE, CJK_SET], 1),
    // 一~龯
    mkCase(45, 'a', CJK_SET, [], 0),
    // \oneof '中文'
    mkCase(46, '中', CHINESE_SAMPLE, [CHINESE_SAMPLE], 1),
    // \oneof '中文'
    mkCase(47, '文', CHINESE_SAMPLE, [CHINESE_SAMPLE], 1),
    // \oneof '中文'
    mkCase(48, '英', CHINESE_SAMPLE, [], 0),
    // \oneof 'a中😀' (single-code-unit + double-code-unit mixed)
    mkCase(49, 'a', MIXED_SINGLE_AND_SURROGATE, [MIXED_SINGLE_AND_SURROGATE], 1),
    // \oneof 'a中😀'
    mkCase(50, '中', MIXED_SINGLE_AND_SURROGATE, [MIXED_SINGLE_AND_SURROGATE], 1),
    // \oneof 'a中😀'
    mkCase(51, '😀', MIXED_SINGLE_AND_SURROGATE, [MIXED_SINGLE_AND_SURROGATE], 2),
    // \oneof 'a中😀'
    mkCase(52, 'b', MIXED_SINGLE_AND_SURROGATE, [], 0),
    // 一~😀 (range spanning BMP and supplementary plane)
    mkCase(53, '一', MIXED_RANGE_SET, [MIXED_RANGE, MIXED_RANGE_SET], 1),
    // 一~😀
    mkCase(54, '中', MIXED_RANGE_SET, [MIXED_RANGE, MIXED_RANGE_SET], 1),
    // 一~😀
    mkCase(55, '😀', MIXED_RANGE_SET, [MIXED_RANGE, MIXED_RANGE_SET], 2),
    // 一~😀
    mkCase(56, 'a', MIXED_RANGE_SET, [], 0),
    // {}
    mkCase(57, 'a', EMPTY_SET, [], 0),
    // {}
    mkCase(58, 'a', EMPTY_ARRAY_SET, [], 0),
    // a~z
    mkCase(59, 'ab', AZ_SET, [AZ_RANGE, AZ_SET], 2, 1),
    // a~z
    mkCase(60, 'a5', AZ_SET, [], 1, 1),
    // \oneof '0123456789'
    mkCase(61, 'a', DIGITS, [], 1, 1),
    // \oneof '😀'
    mkCase(62, 'x😀y', EMOJI_SET, [EMOJI_SET], 3, 1),
    // { AnyChar }
    mkCase(63, 'a', ANYCHAR_SET, [AnyChar, ANYCHAR_SET], 1),
    // { AnyChar }
    mkCase(64, '5', ANYCHAR_SET, [AnyChar, ANYCHAR_SET], 1),
    // { AnyChar }
    mkCase(65, '😀', ANYCHAR_SET, [AnyChar, ANYCHAR_SET], 2),
    // { AnyChar }
    mkCase(66, '中', ANYCHAR_SET, [AnyChar, ANYCHAR_SET], 1),
    // { AnyChar }
    mkCase(67, '', ANYCHAR_SET, [], 0),
    // { 0~9; AnyChar } - digit matches first, AnyChar as fallback
    mkCase(68, '5', DIGIT_OR_ANYCHAR, [DIGIT_RANGE, DIGIT_OR_ANYCHAR], 1),
    // { 0~9; AnyChar } - AnyChar matches when not a digit
    mkCase(69, 'a', DIGIT_OR_ANYCHAR, [AnyChar, DIGIT_OR_ANYCHAR], 1),
    // { 0~9; AnyChar } - AnyChar matches emoji
    mkCase(70, '😀', DIGIT_OR_ANYCHAR, [AnyChar, DIGIT_OR_ANYCHAR], 2),
    // { a~z; AnyChar } - letter matches first, AnyChar as fallback
    mkCase(71, 'a', LETTER_OR_ANYCHAR, [AZ_RANGE, LETTER_OR_ANYCHAR], 1),
    // { a~z; AnyChar } - AnyChar matches when not a letter
    mkCase(72, '5', LETTER_OR_ANYCHAR, [AnyChar, LETTER_OR_ANYCHAR], 1),
    // { a~z; AnyChar } - AnyChar matches emoji
    mkCase(73, '😀', LETTER_OR_ANYCHAR, [AnyChar, LETTER_OR_ANYCHAR], 2),
    // { a~z; AnyChar } - AnyChar matches Chinese character
    mkCase(74, '中', LETTER_OR_ANYCHAR, [AnyChar, LETTER_OR_ANYCHAR], 1),
    // { AnyChar } - non-zero starting position
    mkCase(75, 'x5a', ANYCHAR_SET, [AnyChar, ANYCHAR_SET], 2, 1),
    // { AnyChar } - non-zero starting position matching emoji
    mkCase(76, 'x😀y', ANYCHAR_SET, [AnyChar, ANYCHAR_SET], 3, 1),
  ];

  for (const c of cases) {
    const pos = c.pos ?? 0;
    try {
      const result = matchChar(c.src, pos, c.match_set);
      assert.deepStrictEqual(result, c.expected);
    } catch (e) {
      console.error(`Failed at case id=${c.id}, src=${JSON.stringify(c.src)}, pos=${pos} (search: mkCase(${c.id},)`);
      throw e;
    }
  }
}

function run_all_tests(): void {
  console.log('Running match_char tests...\n');
  try {
    test_match_char();
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  run_all_tests();
}
