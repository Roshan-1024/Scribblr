import { useRoute } from './router';

export default function App() {
  const route = useRoute();
  return (
    <div className="center-screen">
      <div className="brand"><img src="/logo.svg" alt="" />Scribblr</div>
      <p className="muted">{route.name}</p>
    </div>
  );
}
