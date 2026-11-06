/** Shown when scribblr.config.json has no Supabase keys yet. */
export default function Setup() {
  return (
    <div className="center-screen">
      <div className="panel" style={{ maxWidth: 520, padding: 32, lineHeight: 1.6 }}>
        <div className="brand"><img src="/logo.svg" alt="" />Scribblr</div>
        <h2>Connect Supabase</h2>
        <p>No valid Supabase project is configured. Check <code>scribblr.public.json</code>, or run <code>scribblr --config</code> to use your own project.</p>
      </div>
    </div>
  );
}
