import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from './supabase';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session; profile: Profile };

async function loadProfile(session: Session): Promise<Profile> {
  const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  return (
    data ?? {
      id: session.user.id,
      email: session.user.email ?? null,
      display_name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Me',
      color: '#4262FF',
      is_admin: false,
    }
  );
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    const apply = async (session: Session | null) => {
      if (!session) return alive && setState({ status: 'signed-out' });
      const profile = await loadProfile(session);
      if (alive) setState({ status: 'signed-in', session, profile });
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') apply(session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return state;
}
