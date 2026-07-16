/** Demo OTP check — accepts 123456 or any 6-digit code. */
export function verifyDemoOtp(code: string) {
  return code === '123456' || code.length === 6;
}
