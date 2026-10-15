import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { ApiError, api, setApiToken, setUnauthorizedHandler } from "./api";
import { forgetPushLocally, turnPushOff } from "./push";

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

  /**
   * Leaving. When they choose to, the phone is first taken off their record so
   * it stops hearing about their bookings. When the server has already refused
   * the login (`forced`), telling it anything would only be refused again — so
   * the phone just forgets its own copy.
   */
  const end = useCallback(async (forced: boolean) => {
    if (forced) await forgetPushLocally();
    else await turnPushOff();
    setApiToken(null);
    setUser(null);
    setStatus("signedOut");
    await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
  }, []);
  const signOut = useCallback(() => end(false), [end]);

  // A login the server has stopped accepting ends here, wherever it was used.
  useEffect(() => {
    setUnauthorizedHandler(() => void end(true));
    return () => setUnauthorizedHandler(null);
  }, [end]);

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
        if (err instanceof ApiError && err.status === 401) return end(true);
        setStatus("signedIn");
      }
    })();
  }, [adopt, end]);

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
