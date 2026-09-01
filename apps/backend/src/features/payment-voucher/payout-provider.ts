/**
 * THE SEAM A PAYOUT API PLUGS INTO — and the one place a key is entered.
 *
 * Everything else in the payout lane works today with no provider at all: a
 * batch is assembled, exported as a bank file, uploaded by the agency to their
 * own corporate banking, and settled from the response. That path is not a
 * fallback to be retired — it is what every agency does now, and it stays.
 *
 * A provider only removes the two manual steps in the middle.
 *
 * ── WHOSE MONEY, AND THEREFORE WHOSE KEY ────────────────────────────────────
 * InnocenZ does NOT hold agency money (owner's decision, 27 Aug 2026). So a
 * payout API is always called against an account the AGENCY owns, with the
 * agency as payer of record. That is not a preference; taking custody of funds
 * to pay third parties is e-money / remittance activity under FSA 2013 and
 * MSBA 2011 and needs a licence and capital InnocenZ does not have.
 *
 * ⚠️ WHAT IS AND IS NOT BUILT HERE — read before wiring a provider.
 *
 * BUILT: the interface, the config, the registry, and every caller. Set the env
 * vars below and `resolvePayoutProvider()` starts returning a provider instead
 * of null; the controller already branches on that.
 *
 * NOT BUILT: any actual provider adapter. Writing one against Curlec/iPay88
 * needs their current API docs and a sandbox key to test against, and an
 * adapter that has never made a sandbox call is worse than no adapter — it
 * fails for the first time with real wages in it. Implement `PayoutProvider`,
 * register it in `PROVIDERS`, exercise it in sandbox, then set the env.
 *
 * ⚠️ SINGLE ACCOUNT ONLY, for now. These env vars configure ONE provider
 * account for the whole deployment, which is correct while one company runs one
 * agency and wrong the moment two agencies pay from different accounts. The
 * shape below already carries `agencyId` into every call so a per-agency
 * credential store can replace `credentialsFromEnv()` without touching a single
 * caller. Do not paper over that by sharing one key across agencies: it would
 * make InnocenZ the payer, which is the exact thing the decision above forbids.
 */

/** One payee line handed to a provider. Amounts are decimal strings, as stored. */
export type PayoutProviderItem = {
  /** Our `payout_batch_item.id` — echoed back so results can be matched. */
  itemId: string;
  /** Decimal string, e.g. '875.00'. NEVER a float: this is money. */
  amount: string;
  payeeName: string;
  payeeIc: string | null;
  bankName: string;
  bankAccountNo: string;
  /** Shown on the payee's statement. Keep short; banks truncate hard. */
  reference: string;
};

export type PayoutProviderRequest = {
  /** Whose account pays. Carried even in single-account mode — see the note above. */
  agencyId: string;
  /** Our `payout_batch.reference`, e.g. 'PO-000001'. */
  batchReference: string;
  items: PayoutProviderItem[];
};

/**
 * A provider's verdict on ONE line.
 *
 * Per line, never per batch, for the same reason `payout_batch_item` carries
 * its own status: a run where 57 land and 2 bounce is the normal bad day.
 */
export type PayoutProviderItemResult = {
  itemId: string;
  status: 'sent' | 'paid' | 'failed';
  providerPayoutId?: string | null;
  /** The provider's own words, kept verbatim — it is the evidence. */
  failureReason?: string | null;
};

export type PayoutProviderResult = {
  providerBatchId: string;
  items: PayoutProviderItemResult[];
};

export interface PayoutProvider {
  /** Stored on `payout_batch.provider`, e.g. 'curlec'. */
  readonly name: string;
  /**
   * Hand the batch over. MUST be idempotent on `batchReference` — a retry after
   * a dropped response must not pay everyone twice.
   */
  submit(request: PayoutProviderRequest): Promise<PayoutProviderResult>;
  /**
   * Ask what happened since. Disbursement is asynchronous everywhere: `submit`
   * returning 'sent' means accepted, never landed.
   */
  poll(providerBatchId: string): Promise<PayoutProviderResult>;
}

export type PayoutCredentials = {
  provider: string;
  apiKey: string;
  apiSecret?: string;
  /** The provider's id for the paying account, where they use one. */
  accountId?: string;
};

/**
 * Registered adapters, by `provider` name.
 *
 * EMPTY ON PURPOSE — see the "NOT BUILT" note at the top. Adding one is:
 *   registerPayoutProvider('curlec', (creds) => new CurlecPayoutProvider(creds));
 */
const PROVIDERS: Record<string, (creds: PayoutCredentials) => PayoutProvider> = {};

/** Register an adapter. Exported so a provider module can self-register. */
export function registerPayoutProvider(
  name: string,
  factory: (creds: PayoutCredentials) => PayoutProvider,
): void {
  PROVIDERS[name] = factory;
}

/**
 * ⚙️ THE API KEY GOES HERE — in the environment, never in the repo.
 *
 *   PAYOUT_PROVIDER=curlec
 *   PAYOUT_API_KEY=...
 *   PAYOUT_API_SECRET=...
 *   PAYOUT_ACCOUNT_ID=...
 *
 * Returns null when unset, which is the normal state and NOT an error: the file
 * export path is fully functional without it.
 */
export function credentialsFromEnv(): PayoutCredentials | null {
  const provider = process.env.PAYOUT_PROVIDER?.trim();
  const apiKey = process.env.PAYOUT_API_KEY?.trim();
  // Both halves or nothing. A provider named with no key is a misconfiguration
  // that would otherwise surface as an auth failure mid-payout.
  if (!provider || !apiKey) return null;
  return {
    provider,
    apiKey,
    apiSecret: process.env.PAYOUT_API_SECRET?.trim() || undefined,
    accountId: process.env.PAYOUT_ACCOUNT_ID?.trim() || undefined,
  };
}

/**
 * The provider for this agency, or null to mean "use the file path".
 *
 * `agencyId` is accepted and currently unused — it is the parameter a
 * per-agency credential store slots into, and taking it now means that change
 * touches this function only.
 */
export function resolvePayoutProvider(
  agencyId: string,
  credentials: PayoutCredentials | null = credentialsFromEnv(),
): PayoutProvider | null {
  void agencyId;
  if (!credentials) return null;
  const factory = PROVIDERS[credentials.provider];
  if (!factory) {
    // Named but unregistered is a CONFIGURATION ERROR, not "no provider".
    // Returning null here would silently drop an agency that believes it is
    // paying by API back onto the file path, with nobody told.
    throw new Error(
      `PAYOUT_PROVIDER='${credentials.provider}' has no registered adapter. ` +
        `Implement PayoutProvider and call registerPayoutProvider('${credentials.provider}', ...), ` +
        'or unset PAYOUT_PROVIDER to use bank-file export.',
    );
  }
  return factory(credentials);
}

/** Is an API payout available at all? Cheap check for surfacing the option. */
export function payoutProviderConfigured(): boolean {
  return credentialsFromEnv() !== null;
}
