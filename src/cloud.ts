import { createClient } from "@supabase/supabase-js";
import type { CloudRepository } from "./sync";
import { parseBackup } from "./db";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
function configured() {
  try {
    return (
      !!url &&
      !!key &&
      /^https?:$/.test(new URL(url).protocol) &&
      !url.includes("YOUR_PROJECT") &&
      !key.includes("YOUR_PUBLIC")
    );
  } catch {
    return false;
  }
}
export const supabase = configured()
  ? createClient(url!, key!, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
const safeRevision = (n: unknown) => {
  if (!Number.isSafeInteger(Number(n)) || Number(n) < 1)
    throw new Error("Invalid cloud revision");
  return Number(n);
};
export const cloudRepository: CloudRepository | null = supabase
  ? {
      async read(owner) {
        const { data, error } = await supabase!
          .from("reading_libraries")
          .select("payload,revision")
          .eq("user_id", owner)
          .abortSignal(AbortSignal.timeout(20000))
          .maybeSingle();
        if (error) throw error;
        return data
          ? {
              value: parseBackup(JSON.stringify(data.payload)),
              revision: safeRevision(data.revision),
            }
          : null;
      },
      async push(owner, value, revision) {
        const { data, error } = await supabase!
          .rpc("save_reading_library", {
            p_payload: JSON.parse(JSON.stringify(value)),
            p_expected_revision: revision,
            p_user_id: owner,
          })
          .abortSignal(AbortSignal.timeout(20000));
        if (error) throw error;
        return safeRevision(data);
      },
    }
  : null;
export async function loginWithGoogle() {
  if (!supabase) throw new Error("Вход в аккаунт ещё не подключён.");
  if (!navigator.onLine)
    throw new Error("Для входа через Google нужен интернет.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + "/",
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
    },
  });
  if (error)
    throw new Error(
      "Не удалось открыть вход через Google. Попробуйте ещё раз.",
    );
}
export async function logout() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error)
    throw new Error("Не удалось выйти из аккаунта. Попробуйте ещё раз.");
}
