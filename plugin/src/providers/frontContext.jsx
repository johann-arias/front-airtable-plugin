import { createContext, useContext, useEffect, useState } from 'react';
import Front from '@frontapp/plugin-sdk';

export const FrontContext = createContext();

export function useFrontContext() {
  return useContext(FrontContext);
}

export function FrontContextProvider({ children }) {
  const [context, setContext] = useState(null);

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
