import { describe, expect, it } from 'vitest';
import { guardMemberChange, type MemberLike } from './member-change-guard.js';

const owner = (id: string, status = 'active'): MemberLike => ({ id, subRole: 'owner', status });
const finance = (id: string, status = 'active'): MemberLike => ({
  id,
  subRole: 'finance',
  status,
});

describe('guardMemberChange', () => {
  it('refuses removing the only active owner', () => {
    const target = owner('m1');
    const members = [target, finance('m2')];
    expect(guardMemberChange({ members, target })).toMatch(/last active owner/i);
  });

  it('allows removing an owner when another active owner remains', () => {
    const target = owner('m1');
    const members = [target, owner('m2')];
    expect(guardMemberChange({ members, target })).toBeNull();
  });

  it('refuses demoting the only active owner', () => {
    const target = owner('m1');
    expect(guardMemberChange({ members: [target], target, next: { subRole: 'finance' } })).toMatch(
      /last active owner/i,
    );
  });

  it('refuses deactivating the only active owner', () => {
    const target = owner('m1');
    expect(guardMemberChange({ members: [target], target, next: { status: 'suspended' } })).toMatch(
      /last active owner/i,
    );
  });

  it('allows a no-op change on the only active owner', () => {
    // Re-sending subRole 'owner' + status 'active' must not be refused — a save
    // that resends the current values is the commonest shape a UI produces, and
    // refusing it would make the screen unusable.
    const target = owner('m1');
    expect(guardMemberChange({ members: [target], target, next: { subRole: 'owner' } })).toBeNull();
    expect(guardMemberChange({ members: [target], target, next: { status: 'active' } })).toBeNull();
    expect(guardMemberChange({ members: [target], target, next: {} })).toBeNull();
  });

  it('never blocks changes to a non-owner', () => {
    const target = finance('m2');
    const members = [owner('m1'), target];
    expect(guardMemberChange({ members, target })).toBeNull();
    expect(guardMemberChange({ members, target, next: { status: 'suspended' } })).toBeNull();
  });

  it('does not count an INACTIVE owner as cover for removing the active one', () => {
    // The trap: an org with one active owner and one suspended owner looks like
    // "two owners" to a naive count, and removing the active one would strand it
    // behind an account nobody can sign in as.
    const target = owner('m1');
    const members = [target, owner('m2', 'suspended')];
    expect(guardMemberChange({ members, target })).toMatch(/last active owner/i);
  });

  it('treats an already-inactive owner as removable', () => {
    const target = owner('m1', 'suspended');
    expect(guardMemberChange({ members: [target, owner('m2')], target })).toBeNull();
    // ...even as the ONLY owner row: the org has no active owner either way, so
    // refusing here protects nothing and blocks the cleanup.
    expect(guardMemberChange({ members: [target], target })).toBeNull();
  });

  it('blocks one owner from stranding the org by removing the last OTHER owner', () => {
    // A self-check alone would miss this: the actor is not the target.
    const target = owner('m2');
    const members = [owner('m1', 'suspended'), target];
    expect(guardMemberChange({ members, target })).toMatch(/last active owner/i);
  });
});
