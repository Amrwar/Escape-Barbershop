import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { ApiError, api, setApiToken, setUnauthorizedHandler } from "./api";

/**
 * Who is signed in. The token lives in the phone's secure storage (Keychain on
 * iPhone, Keystore on Android) and is renewed each time the app opens, so a
 * customer who comes back at least once a month stays signed in up to the
 * shop's ninety-day cap.
 */

interface User {
  id: string;
  name: string;
  role: string;
}

interface SessionResponse {
  token: string;
  user: User;
}

interface AuthValue {
  /** "loading" while the stored login is still being read and renewed. */
  status: "loading" | "signedIn" | "signedOut";
  user: User | null;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const KEY = "session-token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthValue["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);

  const adopt = useCallback(async (session: SessionResponse) => {
    setApiToken(session.token);
    setUser(session.user);
    setStatus("signedIn");
    // Somewhere it cannot be kept (the browser preview has no secure store),
    // the login simply lasts until the app closes.
    await SecureStore.setItemAsync(KEY, session.token).catch(() => undefined);
  }, []);

  const signOut = useCallback(async () => {
    setApiToken(null);
    setUser(null);
    setStatus("signedOut");
    await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
  }, []);

  // A login the server has stopped accepting ends here, wherever it was used.
  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync(KEY).catch(() => null);
      if (!stored) return setStatus("signedOut");
      setApiToken(stored);
      try {
        await adopt(await api<SessionResponse>("/api/mobile/session"));
      } catch (err) {
        // Refused means the login is over. Anything else — no signal in the
        // shop's basement — keeps them signed in on the token they have.
        if (err instanceof ApiError && err.status === 401) return signOut();
        setStatus("signedIn");
      }
    })();
  }, [adopt, signOut]);

  const signIn = useCallback(
    async (phone: string, password: string) => {
      await adopt(await api<SessionResponse>("/api/mobile/session", { method: "POST", body: { phone, password } }));
    },
    [adopt]
  );

  const value = useMemo(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
