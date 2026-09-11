import { Request } from 'express';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';

/**
 * How a caller is confined when reading/writing org-owned resources (shifts,
 * assignments, sales): admin (everything), agency member (their agency), or
 * outlet member (their own venues). `outletIds` is empty for non-outlet callers.
 * Always resolved from the DB — never trusted from the request body.
 */
export type OrgScope = {
  isAdmin: boolean;
  agencyId: string | null;
  outletIds: string[];
};

/** The repositories `resolveOrgScope` needs; controllers already hold all three. */
export type OrgScopeDeps = {
  authRepository: AuthRepositoryClass;
  agencyMemberRepository: AgencyMemberRepositoryClass;
  outletMemberRepository: OutletMemberRepositoryClass;
};

/** True when the caller is an outlet operator (no admin/agency scope, ≥1 outlet). */
export function isOutletCaller(scope: OrgScope): boolean {
  return !scope.isAdmin && !scope.agencyId && scope.outletIds.length > 0;
}

/**
 * The agency a caller acts for, or null. ACTIVE MEMBERSHIPS ONLY.
 *
 * Exported because this one line was copy-pasted into three controllers that do
 * NOT import this file — `payment-voucher.controller` twice (its private
 * `resolveScope`, and again inline in `listAgencyReceipts`) and
 * `pr.controller` — and every copy carried the same bug, so fixing
 * `resolveOrgScope` alone would have left the money lane open.
 *
 * Every copy ended `?? memberships[0]`, which took the FIRST row whatever its
 * status. `AgencyMemberRepository.remove` only flips `status` to 'inactive' and
 * `listByUser` has no status predicate, so removing a member revoked nothing:
 * the `find` missed, the fallback handed back the dead row, and the removed
 * operator's next request resolved their old agencyId as though they were still
 * staff. An inactive membership is not a weaker membership — it is the absence
 * of one, and the fallback was the only thing turning it back into one.
 *
 * Nothing legitimate is lost. `agency_user.status` is `varchar(50) NOT NULL
 * DEFAULT 'active'` with no enum behind it, and every path that inserts a row
 * writes 'active' literally (`auth.controller` register, both invite-accept
 * branches in `org-member-invite.controller`). There is no pending or invited
 * membership for the fallback to rescue — invites live in `org_member_invite`
 * with their own status, and the `agency_user` row is not created until the
 * invite is accepted. `remove()` is the only writer of anything else, and that
 * is exactly the case this must refuse.
 */
export function activeAgencyId(
  memberships: readonly { agencyId: string; status: string }[],
): string | null {
  return memberships.find((m) => m.status === 'active')?.agencyId ?? null;
}

/**
 * Admins see everything; every other caller is confined to the org they belong
 * to. Agency membership wins when a user somehow holds both, and the outlet
 * fallback lets a venue operator read the shifts/rosters/sales at its own venues.
 */
/**
 * The organisation the caller says they are working in, straight off the
 * request. Never trusted on its own — every reader below checks it against a
 * membership first.
 */
/**
 * WHICH KIND of organisation the caller says they are working in.
 *
 * ⚠️ `x-org-id` alone cannot say whether it names an agency or a venue, so
 * anything resolving from it had to GUESS by looking the id up in both
 * membership tables. A pin left on a venue then answered for requests made
 * from the AGENCY console. The portals now send this beside the id.
 *
 * Absent on an older client, and every caller must treat that as "unknown" and
 * fall back to the behaviour it had before — never as a default of either kind.
 */
export function pickedOrgKind(req: Request): 'agency' | 'outlet' | null {
  const raw = req.header('x-org-kind');
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value === 'agency' || value === 'outlet' ? value : null;
}

export function pickedOrgId(req: Request): string | null {
  const raw = req.header('x-org-id');
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value ? value : null;
}


/**
 * WHICH AGENCY, given a caller's memberships and their request.
 *
 * Exported because this rule was hand-copied into four places that do not
 * import each other — `payment-voucher.controller` twice (its private
 * `resolveScope`, and again inline inside `listAgencyReceipts`),
 * `payout-batch.controller`, and `pr.controller` — and every copy ended at
 * `activeAgencyId`, the OLDEST active membership.
 *
 * That was survivable while nothing else could disagree with it. It stopped
 * being survivable when the GUARDS became organisation-aware: a guard that
 * honours a verified `x-org-id` while the handler beside it takes the oldest
 * membership will approve the finance lane at agency B and then write agency
 * A's voucher. Guard and handler must answer this question the same way, so
 * they now answer it with the same function.
 *
 * The header is VERIFIED, never trusted — honoured only when it names a
 * membership active for this caller — and an unknown or stale value falls
 * through to the previous behaviour rather than failing the request.
 */
export function pickAgencyId(
  req: Request,
  memberships: readonly { agencyId: string; status: string }[],
): string | null {
  const requested = pickedOrgId(req);
  const chosen = requested
    ? memberships.find(
        (m) => m.status === 'active' && m.agencyId === requested,
      )?.agencyId
    : undefined;
  return chosen ?? activeAgencyId(memberships);
}

export async function resolveOrgScope(
  req: Request,
  deps: OrgScopeDeps,
): Promise<OrgScope> {
  const user = req.user!;
  const roles = await deps.authRepository.getRolesForUserIds([user.id]);
  const isAdmin = roles.some((r) => r.roleName === 'admin');
  if (isAdmin) return { isAdmin: true, agencyId: null, outletIds: [] };

  const memberships = await deps.agencyMemberRepository.listByUser(user.id);
  /**
   * `activeAgencyId`, not `find(...) ?? memberships[0]` — see the note on that
   * helper. The fallback re-admitted a removed member with the agency's FULL
   * scope across all 39 call sites of this function; `holdsAgencyLane` already
   * refused them, so sub-role-guarded writes failed closed, but every route
   * gated by `requireRole('agency')` alone did not, and those include reads of
   * the roster and of money.
   */
  /**
   * WHICH agency, when the caller staffs more than one.
   *
   * `activeAgencyId` answers with the FIRST active membership, which after
   * `listByUser`'s ordering is the OLDEST — deterministic, but nobody chose
   * it. A person at two agencies would silently operate only the older one on
   * every call site of this function, and the newer agency would look like it
   * had invited somebody who never arrived. That is the same find-the-first
   * shape that twice sent a PR's money to the wrong agency.
   *
   * So the caller may NAME one, and the header is verified rather than
   * trusted: it is honoured only when it matches a membership that is active
   * for this user. An unknown, foreign or deactivated id falls through to the
   * old behaviour instead of failing the request — a stale pick in a browser
   * tab must not lock someone out of a portal they can legitimately use.
   */
  /**
   * ⚠️ A NAMED OUTLET BEATS AN UNNAMED AGENCY.
   *
   * The agency branch below used to win outright: hold ONE active agency
   * membership and this returned `{agencyId, outletIds: []}` without ever
   * reading the venue side. For anyone who both owns a venue and staffs an
   * agency — an ordinary thing here — that meant:
   *
   *   · every invoice for their own venue failed the ownership test and
   *     answered 404, so the Pay button worked for nobody but they were told
   *     "not found" rather than "not allowed"; and
   *   · the outlet Settings page read and WROTE the agency's payment method,
   *     because `ownerFor` got an agency scope while the screen said venue.
   *
   * The portals send `x-org-id` on every request (axios-v1.ts), so the caller
   * has already said which organisation they are acting for. Honouring it here
   * costs one query and removes the guess. Still verified, never trusted: it is
   * used only when it matches a membership that is ACTIVE for this user, and
   * anything else falls through to the behaviour below unchanged.
   */
  const named = pickedOrgId(req);
  const namedKind = pickedOrgKind(req);
  const namesAnAgency = named
    ? memberships.some((m) => m.status === 'active' && m.agencyId === named)
    : false;
  /*
   * ⚠️ ONLY when the caller SAYS it is a venue. Without the kind this branch
   * fired on any id that happened to match a venue the caller staffs —
   * including requests made from the AGENCY console with a stale pin — and
   * scoped that whole session to the venue. A client too old to send the kind
   * keeps the previous behaviour (agency wins) rather than getting a guess.
   */
  if (named && namedKind === 'outlet' && !namesAnAgency) {
    const namedOutlets = await deps.outletMemberRepository.listByUser(user.id);
    const holdsIt = namedOutlets.some(
      (m) => m.status === 'active' && m.outletId === named,
    );
    if (holdsIt) {
      return { isAdmin: false, agencyId: null, outletIds: [named] };
    }
  }

  const agencyId = pickAgencyId(req, memberships);
  if (agencyId) {
    return { isAdmin: false, agencyId, outletIds: [] };
  }

  const outletMemberships = await deps.outletMemberRepository.listByUser(
    user.id,
  );
  const activeOutletIds = [
    ...new Set(
      outletMemberships
        .filter((m) => m.status === 'active')
        .map((m) => m.outletId),
    ),
  ];
  /*
   * The venue side narrows rather than picks. A venue operator's scope is
   * normally EVERY venue they staff — several hooks depend on that — so a
   * choice here clamps the set to the one they named, and only when they
   * really staff it. Naming nothing keeps every venue, exactly as before.
   */
  const wanted = pickedOrgId(req);
  const outletIds =
    wanted && activeOutletIds.includes(wanted) ? [wanted] : activeOutletIds;
  return { isAdmin: false, agencyId: null, outletIds };
}

/**
 * WHICH ORGANISATION IS THIS CALLER ACTING IN — one answer, for the guards
 * and the handlers alike.
 *
 * The middleware has to know this before it can judge a job title, and the
 * handler has to know it before it writes. If they answer separately they
 * will eventually answer differently, and the failure mode is the worst
 * available: the guard approves the finance lane at agency B while the
 * handler writes agency A's voucher. So there is one ladder, here.
 *
 * The ladder, in order, with no other options:
 *   1. an id the request NAMES (a path param, or a validated body field),
 *   2. the `x-org-id` header,
 *   3. the caller's single active membership, if they have exactly one,
 *   4. null — meaning the caller must be told to name one (400).
 *
 * ⚠️ Steps 1 and 2 are VERIFIED, never trusted: an id only survives if it
 * names a membership that is active for this user. A foreign or stale id
 * therefore falls THROUGH rather than being honoured or 403-ing.
 *
 * ⚠️ Step 3 is deliberately `exactly one`, not `the first one`. The
 * oldest-membership pick (`activeAgencyId`) is deterministic and nobody
 * chose it; using it as a fallback here would silently re-create the bug
 * this whole change exists to remove. Ambiguity must reach the caller as a
 * question, not be resolved by an accident of insertion order.
 *
 * Returns null for an admin: they act on organisations, not within one, so
 * the caller decides what that means (usually: an explicit id is required).
 */
export async function resolveActingOrgId(
  req: Request,
  deps: OrgScopeDeps,
  org: 'agency' | 'outlet',
  explicitId?: string | null,
): Promise<string | null> {
  const user = req.user;
  if (!user) return null;

  const memberships =
    org === 'agency'
      ? (await deps.agencyMemberRepository.listByUser(user.id)).map((m) => ({
          orgId: m.agencyId,
          status: m.status,
        }))
      : (await deps.outletMemberRepository.listByUser(user.id)).map((m) => ({
          orgId: m.outletId,
          status: m.status,
        }));
  const active = memberships.filter((m) => m.status === 'active');

  const named = explicitId?.trim() || pickedOrgId(req);
  if (named && active.some((m) => m.orgId === named)) return named;

  const distinct = [...new Set(active.map((m) => m.orgId))];
  return distinct.length === 1 ? distinct[0] : null;
}
