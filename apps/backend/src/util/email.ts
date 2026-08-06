/** Shared email-address check (kept in util — same as semutz-sj `util/email.ts`). */
export const isEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
