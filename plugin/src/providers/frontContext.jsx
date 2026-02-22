import { createContext, useContext, useEffect, useState } from 'react';
import Front, { delegateNewWindowsToFront } from '@frontapp/plugin-sdk';

export const FrontContext = createContext();

export function useFrontContext() {
  return useContext(FrontContext);
}

export function FrontContextProvider({ children }) {
  const [context, setContext] = useState(null);

  useEffect(() => {
    // So links with target="_blank" (e.g. attachment proxy URLs) open in the browser instead of being blocked by the iframe sandbox
    delegateNewWindowsToFront();
  }, []);

  useEffect(() => {
    const subscription = Front.contextUpdates.subscribe((frontContext) => {
      setContext(frontContext);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <FrontContext.Provider value={context}>
      {children}
    </FrontContext.Provider>
  );
}
