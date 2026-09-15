import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, getToken, setToken } from '../lib/api';

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signup: (email: string, password: string, name: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: AuthUser }>('/api/auth/me')
      .then(({ user }) => setUser(user))
      .catch((err) => {
        // Only drop the session when the server actually rejected the token.
        // Network errors (server unreachable, timeout, etc.) shouldn't force a re-login.
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function signup(email: string, password: string, name: string) {
    const result = await api.post<{ token: string; user: AuthUser }>('/api/auth/signup', { email, password, name });
    setToken(result.token);
    setUser(result.user);
  }

  async function login(email: string, password: string) {
    const result = await api.post<{ token: string; user: AuthUser }>('/api/auth/login', { email, password });
    setToken(result.token);
    setUser(result.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
