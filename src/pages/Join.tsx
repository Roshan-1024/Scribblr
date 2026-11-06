import { useEffect, useState } from 'react';
import { joinBoard } from '../lib/api';
import { errMsg } from '../lib/supabase';
import { navigate } from '../router';

/** Opened by `scribblr <hash>`: adds you to the board, then opens it. */
export default function Join({ code }: { code: string }) {
  const [error, setError] = useState('');
  useEffect(() => {
    joinBoard(code)
      .then((id) => navigate(`/b/${id}`, true))
      .catch((e) => setError(/not found/i.test(errMsg(e)) ? 'No board matches this hash. Check it and try again.' : errMsg(e)));
  }, [code]);
  return (
    <div className="center-screen">
      <div className="panel" style={{ padding: 32, textAlign: 'center', maxWidth: 420 }}>
        <div className="brand" style={{ justifyContent: 'center' }}><img src="/mark.svg" alt="" />Scribblr</div>
        {error ? (
          <>
            <p className="error" style={{ fontSize: 14 }}>{error}</p>
            <button className="btn" onClick={() => navigate('/', true)}>Go to dashboard</button>
          </>
        ) : (
          <p className="muted">Joining board…</p>
        )}
      </div>
    </div>
  );
}
