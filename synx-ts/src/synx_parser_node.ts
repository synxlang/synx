import { mkCharRange, mkCharSet, mkPatternSeq } from './parser_node';
import type { CharMatchRange, CharMatchSet, PatternSeq } from './parser_node';

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

// Symbol = \flat (Letter, SymbolChar*)  — 与 synx.synx 一致
export const Symbol: PatternSeq = mkPatternSeq([Letter, SymbolChar], ' *', true);
