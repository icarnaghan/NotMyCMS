import { useEffect, type ReactNode } from "react";
import Spinner from "@cloudscape-design/components/spinner";
import Box from "@cloudscape-design/components/box";
import { useAuth } from "./use-auth";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Route guard component that checks authentication state.
 * If the user is not authenticated, redirects to Cognito hosted UI.
 * Shows a loading spinner while checking auth state.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, login } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      login();
    }
  }, [isLoading, isAuthenticated, login]);

  if (isLoading) {
    return (
      <Box textAlign="center" padding={{ top: "xxxl" }}>
        <Spinner size="large" />
        <Box variant="p" margin={{ top: "s" }}>
          Checking authentication...
        </Box>
      </Box>
    );
  }

  if (!isAuthenticated) {
    return (
      <Box textAlign="center" padding={{ top: "xxxl" }}>
        <Spinner size="large" />
        <Box variant="p" margin={{ top: "s" }}>
          Redirecting to login...
        </Box>
      </Box>
    );
  }

  return <>{children}</>;
}
