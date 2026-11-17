import { describeValue } from '../../shared/describe-value.js';
import { Currency, ExchangeRate, Money, MoneyFactor } from '../../shared/money/index.js';
import type { ExchangeRateJSON, MoneyJSON } from '../../shared/money/index.js';
import type {
  JournalEntryLineFields,
  JournalEntryLineFunctionalInput,
  JournalEntryLineInput,
  JournalEntryLineRestoreInput,
} from '../dto/journal-entry-line-dto.js';
import { invalidEntryLine } from '../errors/entry-errors.js';
import { requireOptionalText, requireText } from '../entry-text.js';
import type { PostingSide } from '../types/posting-side.js';

/**
 * Module-private proof that construction went through the validating factory.
 * A TypeScript-private constructor is a normal public constructor at runtime, so the token is what
 * actually stops a plain JavaScript caller from building a line that skipped validation.
 */
const CONSTRUCTION_TOKEN = Symbol('JournalEntryLine');

/**
 * Module-private proof that a functional amount came from the aggregate's posting step.
 * A line that could carry an amount a caller wrote would be a line that declares its own worth in the
 * ledger's currency, which is the one value only the entry is allowed to derive from a rate.
 * The barrel does not export this symbol, so outside the domain it is not reachable.
 */
export const FUNCTIONAL_AMOUNT_TOKEN = Symbol('JournalEntryLine.functionalAmount');

/**
 * Immutable line of a journal entry: one account, one side and a strictly positive amount.
 * A line never exists on its own: the entry owns the collection and decides when a line may be
 * added or removed. Whether the account exists, belongs to the ledger or accepts postings is an
 * application check, not a line invariant.
 *
 * A caller-created line has one amount, in the currency it was agreed in. Posting adds the second one:
 * `functionalAmount`, in the ledger's currency, and `rate` when the line had to be converted. Both are
 * absent on a draft, because a draft does not convert (009d, rule 9).
 *
 * There are two doors, and they are not interchangeable. `create` is the draft path: a caller creates the line
 * in the currency it was agreed in and never says what it is worth in the book. `restore` is the host's adapter
 * path: it rebuilds a line from what the host stored, functional amount and rate included, because reading the
 * history must not convert it again (rule 7).
 */
export class JournalEntryLine {
  readonly #id: string;
  readonly #accountId: string;
  readonly #side: PostingSide;
  readonly #amount: Money;
  readonly #functionalAmount: Money | undefined;
  readonly #rate: ExchangeRate | undefined;
  readonly #description: string | undefined;

  private constructor(fields: JournalEntryLineFields, token: typeof CONSTRUCTION_TOKEN) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw invalidEntryLine('a line is created with JournalEntryLine.create, never with new');
    }

    this.#id = fields.id;
    this.#accountId = fields.accountId;
    this.#side = fields.side;
    this.#amount = fields.amount;
    this.#functionalAmount = fields.functionalAmount;
    this.#rate = fields.rate;
    this.#description = fields.description;
    Object.freeze(this);
  }

  static create(input: JournalEntryLineInput): JournalEntryLine {
    if (typeof input !== 'object' || input === null) {
      throw invalidEntryLine(`expected an input object, received ${describeValue(input)}`);
    }

    return new JournalEntryLine({
      id: requireText(input.id, 'id', invalidEntryLine),
      accountId: requireText(input.accountId, 'accountId', invalidEntryLine),
      side: requireSide(input.side),
      amount: requirePositiveAmount(input.amount),
      functionalAmount: undefined,
      rate: undefined,
      description: requireOptionalText(input.description, 'description', invalidEntryLine),
    }, CONSTRUCTION_TOKEN);
  }

  get id(): string {
    return this.#id;
  }

  /**
   * Rebuilds a line a host persisted, functional amount and rate included.
   *
   * It is the counterpart of `create` for adapters: a durable repository has to return the line it stored, and
   * the stored functional amount and rate are the history rule 7 protects. Recomputing them on read would let a
   * later rate or rounding policy move what was already posted, so the host restores them here.
   *
   * The input is the serialized shape of the two stored values (`MoneyJSON` and `ExchangeRateJSON`), hydrated by
   * the money domain's own constructors: an amount that is not a `Money`, a functional amount that is not a
   * valid `MoneyJSON`, or a rate that is not a positive factor between two different currencies fails with that
   * domain's error. A rate only travels with the functional amount it converted. The currency of the functional
   * amount is whatever the host stored; posting is where the entry checks it against the ledger's functional
   * currency.
   */
  static restore(input: JournalEntryLineRestoreInput): JournalEntryLine {
    if (typeof input !== 'object' || input === null) {
      throw invalidEntryLine(`expected an input object, received ${describeValue(input)}`);
    }

    const functionalAmount = requireRestoredFunctionalAmount(input.functionalAmount);
    const rate = requireRestoredRate(input.rate);
    if (rate !== undefined && functionalAmount === undefined) {
      throw invalidEntryLine('a rate is restored only together with the functional amount it converted');
    }

    return new JournalEntryLine({
      id: requireText(input.id, 'id', invalidEntryLine),
      accountId: requireText(input.accountId, 'accountId', invalidEntryLine),
      side: requireSide(input.side),
      amount: requirePositiveAmount(input.amount),
      functionalAmount,
      rate,
      description: requireOptionalText(input.description, 'description', invalidEntryLine),
    }, CONSTRUCTION_TOKEN);
  }

  get accountId(): string {
    return this.#accountId;
  }

  get side(): PostingSide {
    return this.#side;
  }

  /** The amount as it was agreed, in its own currency. Posting never replaces it. */
  get amount(): Money {
    return this.#amount;
  }

  /**
   * The same line in the ledger's functional currency, once the entry posted it; `undefined` on a draft.
   * It is stored with the line and never recalculated, so a later quote or rounding policy does not move
   * the history (rule 7).
   */
  get functionalAmount(): Money | undefined {
    return this.#functionalAmount;
  }

  /** The rate that produced the functional amount, present only when this line was converted (rule 3). */
  get rate(): ExchangeRate | undefined {
    return this.#rate;
  }

  get description(): string | undefined {
    return this.#description;
  }

  /**
   * Returns a copy that carries what posting decided for this line.
   *
   * The token keeps the decision where it belongs: only the entry posts, so only the entry may say what a
   * line is worth in the book's currency.
   */
  withFunctionalAmount(
    input: JournalEntryLineFunctionalInput,
    token: typeof FUNCTIONAL_AMOUNT_TOKEN,
  ): JournalEntryLine {
    if (token !== FUNCTIONAL_AMOUNT_TOKEN) {
      throw invalidEntryLine('a functional amount is attached by the entry when it posts, never by a caller');
    }
    if (typeof input !== 'object' || input === null) {
      throw invalidEntryLine(`expected a functional input object, received ${describeValue(input)}`);
    }
    // The functional amount is not required to be positive: a conversion can round down to zero.
    if (!(input.functionalAmount instanceof Money)) {
      throw invalidEntryLine(`functionalAmount must be a Money, received ${describeValue(input.functionalAmount)}`);
    }
    if (input.rate !== undefined && !(input.rate instanceof ExchangeRate)) {
      throw invalidEntryLine(`rate must be an ExchangeRate, received ${describeValue(input.rate)}`);
    }

    return new JournalEntryLine({
      id: this.#id,
      accountId: this.#accountId,
      side: this.#side,
      amount: this.#amount,
      functionalAmount: input.functionalAmount,
      rate: input.rate,
      description: this.#description,
    }, CONSTRUCTION_TOKEN);
  }
}

function requireSide(value: unknown): PostingSide {
  if (value !== 'DEBIT' && value !== 'CREDIT') {
    throw invalidEntryLine(`side ${describeValue(value)} must be DEBIT or CREDIT`);
  }
  return value;
}

/** Money admits zero and negatives; a posted line does not. The restriction lives here. */
function requirePositiveAmount(value: unknown): Money {
  if (!(value instanceof Money)) {
    throw invalidEntryLine(`amount must be a Money, received ${describeValue(value)}`);
  }
  if (value.minorUnits <= 0n) {
    throw invalidEntryLine(`amount must be strictly positive, received ${value.toDecimal()}`);
  }
  return value;
}

/** A restored functional amount is the serialized one: `Money.fromJSON` owns its validation. */
function requireRestoredFunctionalAmount(value: MoneyJSON | undefined): Money | undefined {
  return value === undefined ? undefined : Money.fromJSON(value);
}

/**
 * A restored rate is hydrated with the rate's own constructor, so its factor and its pair are validated by the
 * money domain and not repeated here. The target is not compared with the stored functional amount: posting
 * checks that the line is worth something in the ledger's currency.
 */
function requireRestoredRate(value: ExchangeRateJSON | undefined): ExchangeRate | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) {
    throw invalidEntryLine(`rate must be an exchange rate, received ${describeValue(value)}`);
  }

  return ExchangeRate.create({
    from: Currency.fromJSON(value.from),
    to: Currency.fromJSON(value.to),
    factor: MoneyFactor.fromDecimal(value.factor),
  });
}
