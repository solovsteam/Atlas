import { Capacitor, registerPlugin } from "@capacitor/core";
import { getAppOrigin } from "../lib/appUrl";
import { supabase } from "../lib/supabase";

const redirectUri = "com.solovsteam.atlas://auth/callback";

const AtlasAuthentication = registerPlugin<{
  authorize(options: { url: string }): Promise<{ callback?: string }>;
}>("AtlasAuthentication");

export async function signInWithGoogle() {
  if (Capacitor.getPlatform() !== "ios") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getAppOrigin() }
    });
    if (error) throw error;
    return;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectUri, skipBrowserRedirect: true }
  });
  if (error) throw error;

  const { callback } = await AtlasAuthentication.authorize({ url: data.url });
  if (!callback) return;

  const url = new URL(callback);
  const target = new URL(redirectUri);
  const code = url.searchParams.get("code");
  if (url.protocol !== target.protocol || url.host !== target.host || url.pathname !== target.pathname || !code) {
    throw new Error("Google sign-in did not return a valid code.");
  }

  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
  if (sessionError) throw sessionError;
}
