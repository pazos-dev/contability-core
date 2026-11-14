// Public surface of the entries domain. Import from here, never from the internal files.
export type { JournalEntryInput, JournalEntryReversalInput } from './dto/journal-entry-dto.js';
export type { JournalEntryLineInput } from './dto/journal-entry-line-dto.js';
export { EntryError } from './errors/entry-errors.js';
export type { EntryErrorCode } from './errors/entry-errors.js';
export type { EntryStatus } from './types/entry-status.js';
export { JournalEntry } from './journal-entry.js';
export { JournalEntryLine } from './value-objects/journal-entry-line.js';
export type { PostingSide } from './types/posting-side.js';
