// Public surface of the entries domain. Import from here, never from the internal files.
export type { JournalEntryInput, JournalEntryReversalInput } from './dto/journal-entry-dto.js';
export type { JournalEntryLineInput } from './dto/journal-entry-line-dto.js';
export { EntryError } from './entry-errors.js';
export type { EntryErrorCode } from './entry-errors.js';
export type { EntryStatus } from './entry-status.js';
export { JournalEntry } from './journal-entry.js';
export { JournalEntryLine } from './journal-entry-line.js';
export type { PostingSide } from './posting-side.js';
