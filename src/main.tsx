import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider, useAuth, useUser, SignIn, SignUp, UserButton } from '@clerk/clerk-react';
import { App, ClerkBridgeContext, type ClerkBridgeValue } from './App';

const CLERK_PUBLISHABLE_KEY =
  (import.meta as any).env?.VITE_CLERK_PUBLISHABLE_KEY ||
  (import.meta as any).env?.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  '';

const hasLiveClerkKey =
  typeof CLERK_PUBLISHABLE_KEY === 'string' &&
  CLERK_PUBLISHABLE_KEY.startsWith('pk_') &&
  !CLERK_PUBLISHABLE_KEY.startsWith('pk_test_...');

const clerkAppearance = {
  variables: {
    colorPrimary: '#172819',
    colorText: '#1c1c19',
    colorBackground: '#ffffff',
    colorInputBackground: '#f6f3ee',
    borderRadius: '0.75rem',
    fontFamily: '"Plus Jakarta Sans", sans-serif',
  },
};

function ClerkConnectedApp() {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth();
  const { user } = useUser();

  const bridge: ClerkBridgeValue = {
    enabled: true,
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    userId: userId || null,
    email: user?.primaryEmailAddress?.emailAddress || null,
    fullName: user?.fullName || user?.firstName || null,
    getToken: async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    },
    signOut: async () => {
      await signOut();
    },
    renderSignIn: () => (
      <div className="flex justify-center py-2">
        <SignIn appearance={clerkAppearance} routing="hash" />
      </div>
    ),
    renderSignUp: () => (
      <div className="flex justify-center py-2">
        <SignUp appearance={clerkAppearance} routing="hash" />
      </div>
    ),
    renderUserButton: () => <UserButton appearance={clerkAppearance} />,
  };

  return (
    <ClerkBridgeContext.Provider value={bridge}>
      <App />
    </ClerkBridgeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {hasLiveClerkKey ? (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} appearance={clerkAppearance}>
        <ClerkConnectedApp />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
