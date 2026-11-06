import { useEffect, useState } from 'react';

/** Tiny hash router: #/  #/login  #/b/<boardId>  #/join/<code> */
export type Route =
  | { name: 'dashboard' }
  | { name: 'login' }
  | { name: 'board'; id: string }
  | { name: 'join'; code: string };

export function parseRoute(hash = location.hash): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'login') return { name: 'login' };
  if (parts[0] === 'b' && parts[1]) return { name: 'board', id: parts[1] };
  if (parts[0] === 'join' && parts[1]) return { name: 'join', code: parts[1] };
  return { name: 'dashboard' };
}

export function navigate(path: string, replace = false) {
  const h = '#' + path;
  if (replace) history.replaceState(null, '', h);
  else history.pushState(null, '', h);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const on = () => setRoute(parseRoute());
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return route;
}
