import { completeCharRange, completeCharSet, completePatternSeq } from './parser_node';
import type { CharMatchRange, CharMatchSet, PatternSeq } from './parser_node';
// Digit = 0~9
export const Digit: CharMatchRange = completeCharRange({ start: '0', end: '9' });
// Letter = { a~z; A~Z; '_' } (OtherLanguageLetter not included here)
export const Letter: CharMatchSet = completeCharSet({ sub_nodes: [
        completeCharRange({ start: 'a', end: 'z' }),
        completeCharRange({ start: 'A', end: 'Z' }),
        completeCharSet({ sub_nodes: '_' }),
    ] });
// SymbolChar = { Letter; Digit }
export const SymbolChar: CharMatchSet = completeCharSet({ sub_nodes: [Letter, Digit] });
// Symbol = \raw (Letter, SymbolChar*)
export const Symbol: PatternSeq = completePatternSeq({ sub_nodes: [Letter, SymbolChar], sub_quantifiers: ' *', raw: true });
