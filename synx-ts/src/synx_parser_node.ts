import { mkCharRange, mkCharSet, mkPatternSeq, mkToken } from './parser_node';
import type { CharMatchRange, CharMatchSet, PatternSeq, Token } from './parser_node';

// Digit = 0~9
export const Digit: CharMatchRange = mkCharRange('0', '9');

// Letter = { a~z; A~Z; '_' } (OtherLanguageLetter not included here)
export const Letter: CharMatchSet = mkCharSet([
  mkCharRange('a', 'z'),
  mkCharRange('A', 'Z'),
  mkCharSet('_'),
]);

// SymbolChar = { Letter; Digit }
export const SymbolChar: CharMatchSet = mkCharSet([Letter, Digit]);

// SymbolToken = \token Letter, SymbolChar*
export const Symbol: Token = mkToken(mkPatternSeq([Letter, SymbolChar], ' *'));
