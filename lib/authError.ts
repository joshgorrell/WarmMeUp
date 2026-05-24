export function friendlyAuthError(e: unknown): string {
  const raw: string =
    e instanceof Error
      ? e.message
      : typeof (e as any)?.message === 'string'
      ? (e as any).message
      : String(e);

  const lower = raw.toLowerCase();

  if (
    lower.includes('aborted') ||
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('522') ||
    lower.includes('failed to fetch') ||
    lower.includes('connection')
  ) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (lower.includes('invalid login') || lower.includes('invalid credentials') || lower.includes('wrong password')) {
    return 'Incorrect email or password.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }
  if (lower.includes('too many') || lower.includes('rate limit') || lower.includes('retry-after')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (lower.includes('already registered') || lower.includes('user already exists')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (lower.includes('weak password') || lower.includes('password should')) {
    return 'Password is too weak. Use at least 8 characters.';
  }

  // If the raw message looks like a JSON blob or HTTP response object, don't show it.
  if (raw.startsWith('{') || raw.startsWith('[') || raw.length > 120) {
    return 'Something went wrong. Please try again.';
  }

  return raw || 'Something went wrong. Please try again.';
}
