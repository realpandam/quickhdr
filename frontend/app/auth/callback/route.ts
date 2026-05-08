import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = requestUrl.searchParams.get('returnTo') ?? '/dashboard';

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { data } = await supabase.auth.exchangeCodeForSession(code);

    // Ulož souhlas pro nové Google uživatele přes Service Role
    if (data?.user) {
      const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      // Zkontroluj jestli souhlas již existuje
      const { data: existing } = await adminSupabase
        .from('user_consents')
        .select('user_id')
        .eq('user_id', data.user.id)
        .single();

      // Ulož souhlas pouze pro nové uživatele
      if (!existing) {
        await adminSupabase.from('user_consents').insert({
          user_id: data.user.id,
          agreed_to_terms_at: new Date().toISOString(),
          agreed_to_privacy_at: new Date().toISOString(),
          ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip'),
          user_agent: request.headers.get('user-agent'),
        });
      }
    }
  }

  return NextResponse.redirect(new URL(returnTo, requestUrl.origin));
}