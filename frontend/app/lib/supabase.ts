import { createBrowserClient } from '@supabase/ssr';

// Lazy singleton — createBrowserClient se volá až při prvním použití,
// ne při importu modulu. To zabrání pádu Next.js SSR buildu kdy
// NEXT_PUBLIC_SUPABASE_URL a NEXT_PUBLIC_SUPABASE_ANON_KEY nejsou dostupné.
let _client: ReturnType<typeof createBrowserClient> | null = null;

function getClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}

export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop) {
    return (getClient() as any)[prop];
  },
});