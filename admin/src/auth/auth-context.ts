import { createContext } from "react";

export interface AuthUser {
  /** Cognito's internal username (often a UUID) — needed for token refresh. */
  username: string;
  email?: string;
  /** Human-readable label for the UI. Prefer this over `username`. */
  displayName?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  getAccessToken: () => Promise<string | null>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
