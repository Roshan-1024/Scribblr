import { useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import { useRoute } from './router';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import BoardPage from './board/BoardPage';
import Join from './pages/Join';

export default function App() {
  const auth = useAuth();
  const route = useRoute();
  if (!isConfigured) return <Setup />;
  if (auth.status === 'loading') return <div className="center-screen"><div className="brand"><img src="/logo.svg" alt="" />Scribblr</div></div>;
  if (auth.status === 'signed-out') return <Login joining={route.name === 'join'} />;
  const { profile } = auth;
  switch (route.name) {
    case 'join':
      return <Join key={route.code} code={route.code} />;
    case 'board':
      return <BoardPage key={route.id} boardId={route.id} profile={profile} />;
    default:
      return <Dashboard profile={profile} />;
  }
}
