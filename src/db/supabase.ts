import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import logger from '../utils/logger';

// Create two Supabase clients:
// 1. Service role client (for admin operations, bypasses RLS)
// 2. Anon client (for user operations, respects RLS)

let supabaseServiceClient: ReturnType<typeof createClient> | null = null;
let supabaseAnonClient: ReturnType<typeof createClient> | null = null;

if (config.supabase.url && config.supabase.url.startsWith('http')) {
  const serviceRoleKey = config.supabase.serviceRoleKey?.trim();
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required. Get it from Supabase Dashboard > Settings > API > service_role secret. ' +
        'The service role bypasses RLS; without it, user creation (e.g. referrals) will fail with RLS errors.'
    );
  }
  // Service role client (bypasses RLS) - use for admin/system operations
  supabaseServiceClient = createClient(config.supabase.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Anon client (respects RLS) - use for user operations
  // This will be used with JWT tokens for RLS enforcement
  const anonKey = process.env.SUPABASE_ANON_KEY || serviceRoleKey; // Fallback to service key if anon not set
  supabaseAnonClient = createClient(config.supabase.url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Test connection (skip in test environment)
  if (process.env.NODE_ENV !== 'test') {
    (async () => {
      try {
        await supabaseServiceClient!.from('users').select('count').limit(1);
        logger.info('Supabase connection established');
      } catch (error: unknown) {
        logger.error('Failed to connect to Supabase', error);
      }
    })();
  }
}

/**
 * Get Supabase client with RLS enforcement
 * Use this for user operations that should respect RLS policies
 * 
 * For RLS to work, Supabase needs the JWT token in the Authorization header.
 * We create a new client instance for each request with the token.
 * 
 * @param jwtToken - Optional JWT token for authenticated requests
 * @returns Supabase client configured with JWT token
 */
export function getSupabaseClient(jwtToken?: string) {
  if (!config.supabase.url) {
    return supabaseServiceClient || ({} as any);
  }

  const anonKey = process.env.SUPABASE_ANON_KEY || config.supabase.serviceRoleKey;

  // If JWT token provided, create a new client with the token for RLS
  if (jwtToken) {
    const client = createClient(config.supabase.url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      },
    });
    return client;
  }

  // Return anon client for unauthenticated requests
  return supabaseAnonClient || supabaseServiceClient || ({} as any);
}

/**
 * Service role client (bypasses RLS)
 * Use only for admin/system operations
 */
export const supabase = supabaseServiceClient || ({} as any);

/**
 * Anon client (respects RLS)
 * Use for user operations
 */
export const supabaseAnon = supabaseAnonClient || ({} as any);
