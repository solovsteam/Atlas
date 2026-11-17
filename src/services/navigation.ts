import { supabase } from "../lib/supabase";
import { NAVIGATION_METADATA_KEY } from "../../shared/navigation";

export async function savePhoneNavigation(ids: string[]): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { [NAVIGATION_METADATA_KEY]: ids } });
  if (error) throw error;
}
