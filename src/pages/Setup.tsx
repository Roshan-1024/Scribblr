/** Shown when scribblr.config.json has no Supabase keys yet. */
export default function Setup() {
  return (
    <div className="center-screen">
      <div className="panel" style={{ maxWidth: 520, padding: 32, lineHeight: 1.6 }}>
        <div className="brand"><img src="/logo.svg" alt="" />Scribblr</div>
        <h2>Connect Supabase</h2>
        <p>Scribblr doesn't know which Supabase project to use yet. Stop it with <b>Ctrl+C</b> in the terminal, then run:</p>
        <pre style={{ background: '#0f0d2e', color: '#e8e8ff', padding: '10px 12px', borderRadius: 8 }}>scribblr --config</pre>
        <p className="muted">Ask the Scribblr admin for the Supabase URL and publishable key.</p>
      </div>
    </div>
  );
}
