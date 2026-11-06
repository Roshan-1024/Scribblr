import { useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import { useRoute } from './router';
import Login from './pages/Login';
import Setup from './pages/Setup';

export default function App() {
  const auth = useAuth();
  const route = useRoute();
  if (!isConfigured) return <Setup />;
  if (auth.status === 'loading') return <div className="center-screen"><div className="brand"><img src="/logo.svg" alt="" />Scribblr</div></div>;
  if (auth.status === 'signed-out') return <Login />;
  return (
    <div className="center-screen">
      <p>Signed in as {auth.profile.display_name} — {route.name}</p>
    </div>
  );
}
