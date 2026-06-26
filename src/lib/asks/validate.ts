export const ASK_KINDS = ['ask', 'offer'] as const;
export type AskKind = (typeof ASK_KINDS)[number];

export const ASK_STATUSES = ['open', 'closed'] as const;
export type AskStatus = (typeof ASK_STATUSES)[number];

export const ASK_TITLE_MAX = 120;
export const ASK_BODY_MAX = 1000;

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface AskInput {
  kind: string;
  title: string;
  body?: string | null;
}

/**
 * Validate an Asks & Offers post. `kind` must be ask|offer, the title is required
 * (1..ASK_TITLE_MAX) and the optional body is capped. Pure → unit-tested + shared.
 */
export function validateAskOffer(input: AskInput): ValidationResult {
  if (!ASK_KINDS.includes(input.kind as AskKind)) {
    return { ok: false, error: 'Choose “Ask” or “Offer”.' };
  }
  const title = (input.title ?? '').trim();
  if (title.length < 1) return { ok: false, error: 'Add a short title.' };
  if (title.length > ASK_TITLE_MAX) {
    return { ok: false, error: `Title must be under ${ASK_TITLE_MAX} characters.` };
  }
  const body = (input.body ?? '').trim();
  if (body.length > ASK_BODY_MAX) {
    return { ok: false, error: `Details must be under ${ASK_BODY_MAX} characters.` };
  }
  return { ok: true };
}

export interface AskRow {
  kind: AskKind;
  status: AskStatus;
  created_at: string;
}

export interface FilterOpts {
  /** 'ask' | 'offer' | 'all' (default all). */
  kind?: AskKind | 'all';
  /** Include closed posts? (default false — open only). */
  includeClosed?: boolean;
}

/** Filter by kind/status and sort newest-first. Open-only by default. */
export function filterAndSort<T extends AskRow>(rows: T[], opts: FilterOpts = {}): T[] {
  const kind = opts.kind ?? 'all';
  const includeClosed = opts.includeClosed ?? false;
  return rows
    .filter((r) => (kind === 'all' ? true : r.kind === kind))
    .filter((r) => (includeClosed ? true : r.status === 'open'))
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
