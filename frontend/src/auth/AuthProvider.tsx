import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { session } from "./session";
import type { SessionController } from "./session";

const AuthContext = createContext<SessionController>(session);

export function AuthProvider({
  children,
  controller = session,
}: {
  children: ReactNode;
  controller?: SessionController;
}) {
  return <AuthContext value={controller}>{children}</AuthContext>;
}

export function useAuth() {
  const controller = useContext(AuthContext);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  return {
    state,
    login: controller.login,
    logout: controller.logout,
    retry: controller.initialize,
  };
}
