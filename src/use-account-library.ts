import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { cacheRepository } from "./db";
import { cloudRepository, supabase, loginWithGoogle, logout } from "./cloud";
import { LibraryController, type LibraryView } from "./sync";
export function useAccountLibrary() {
  const [controller] = useState(
    () => new LibraryController(cacheRepository, cloudRepository),
  );
  const [view, setView] = useState<LibraryView>({
    owner: null,
    phase: "loading",
    dirty: false,
    guestAvailable: false,
  });
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [authError, setAuthError] = useState("");
  useEffect(() => controller.subscribe(setView), [controller]);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    const hash = new URLSearchParams(window.location.hash.slice(1)),
      query = new URLSearchParams(window.location.search);
    if (hash.has("error") || query.has("error")) {
      setAuthError("Вход через Google не завершён. Попробуйте ещё раз.");
      history.replaceState(null, "", window.location.pathname);
    }
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (authReady)
      void controller
        .open(user?.id ?? null)
        .catch(() =>
          setAuthError(
            "Не удалось открыть библиотеку на устройстве. Перезагрузите приложение.",
          ),
        );
  }, [authReady, user?.id, controller]);
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === "visible") void controller.sync();
    };
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    const timer = window.setInterval(sync, 20000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      clearInterval(timer);
    };
  }, [controller]);
  return {
    ...view,
    data:
      authReady && view.owner === (user?.id ?? null) ? view.data : undefined,
    user,
    configured: !!supabase,
    authReady,
    authError,
    commit: controller.mutate.bind(controller),
    sync: () => controller.sync(),
    resolve: (choice: "local" | "cloud") => controller.resolve(choice),
    importGuest: () => controller.importGuest(),
    login: async () => {
      setAuthError("");
      await loginWithGoogle();
    },
    logout,
  };
}
export type AccountLibrary = ReturnType<typeof useAccountLibrary>;
