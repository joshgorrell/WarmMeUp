interface SupabaseLikeError {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
}

function isSupabaseLikeError(e: unknown): e is SupabaseLikeError {
  return typeof e === 'object' && e !== null && 'message' in e;
}

/**
 * Convert a Supabase auth error, network error, or generic exception into a
 * short, user-readable message.
 */
export function friendlyAuthError(e: unknown): string {
  if (!e) return 'Something went wrong. Please try again.';

  if (isSupabaseLikeError(e)) {
    const msg = (e.message ?? '').toLowerCase();
    const code = e.code ?? '';

    // Invalid login credentials
    if (msg.includes('invalid login credentials')) {
      return 'Incorrect email or password. Please try again.';
    }

    // Email not confirmed
    if (msg.includes('email not confirmed') || code === 'email_not_confirmed') {
      return 'Please confirm your email before signing in. Check your inbox for a confirmation link.';
    }

    // Rate limited
    if (msg.includes('rate limit') || code === 'over_request_rate_limit') {
      return 'Too many attempts. Please wait a moment and try again.';
    }

    // Email already registered
    if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already registered')) {
      return 'An account with this email already exists. Try signing in instead.';
    }

    // Password too weak
    if (msg.includes('password should be at least') || msg.includes('password is too weak')) {
      return 'Password must be at least 8 characters long.';
    }

    // Network errors
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout') || msg.includes('connection')) {
      return 'Network error. Check your internet connection and try again.';
    }

    // OAuth errors
    if (msg.includes('invalid redirect') || msg.includes('discovery')) {
      return 'Sign-in service is temporarily unavailable. Please try again later.';
    }

    // Session expired
    if (msg.includes('session expired') || msg.includes('session not found')) {
      return 'Your session has expired. Please sign in again.';
    }

    // If there's a meaningful message, surface it (truncated)
    if (e.message && e.message.length < 120) {
      return e.message;
    }
  }

  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
      return 'Network error. Check your internet connection and try again.';
    }
    if (e.message && e.message.length < 120) {
      return e.message;
    }
  }

  return 'Something went wrong. Please try again.';
}
