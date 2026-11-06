/** Shown when scribblr.config.json has no Supabase keys yet. */
export default function Setup() {
  return (
    <div className="center-screen">
      <div className="panel" style={{ maxWidth: 520, padding: 32, lineHeight: 1.6 }}>
        <div className="brand"><img src="/logo.svg" alt="" />Scribblr</div>
        <h2>Connect Supabase</h2>
        <ol>
          <li>Create a free project at <b>supabase.com</b>.</li>
          <li>Run <code>supabase/schema.sql</code> in the SQL Editor.</li>
          <li>Copy the Project URL and anon key (Project Settings → API) into <code>scribblr.config.json</code>.</li>
          <li>Run <code>scribblr</code> again.</li>
        </ol>
      </div>
    </div>
  );
}
