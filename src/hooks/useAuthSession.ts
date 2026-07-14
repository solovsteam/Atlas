import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getAppOrigin } from "../lib/appUrl";
import { supabase } from "../lib/supabase";

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAppOrigin()
      }
    });
    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle,
    signOut
  };
}

export function authDisplayName(user: User | null): string {
  if (!user) {
    return "Guest";
  }
  return (
    (user.user_metadata.full_name as string | undefined) ??
    (user.user_metadata.name as string | undefined) ??
    user.email ??
    "Signed in"
  );
}

export function authPicture(user: User | null): string | undefined {
  if (!user) {
    return undefined;
  }
  return (user.user_metadata.avatar_url as string | undefined) ?? (user.user_metadata.picture as string | undefined);
}
