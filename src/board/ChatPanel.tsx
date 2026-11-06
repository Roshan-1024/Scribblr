import { useEffect, useRef, useState, type FormEvent } from 'react';
import Avatar from '../components/Avatar';
import { IconChevronLeft, IconClose, IconSend } from '../components/Icons';
import { supabase, errMsg, type Profile } from '../lib/supabase';

type Author = { display_name: string; color: string };
type Msg = { id: number; user_id: string; body: string; created_at: string; profiles: Author | null };

/** Right-side group chat for everyone with access to the board. */
export default function ChatPanel({ boardId, me, onError }: { boardId: string; me: Profile; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const authors = useRef(new Map<string, Author>([[me.id, { display_name: me.display_name, color: me.color }]]));
  openRef.current = open;

  useEffect(() => {
    let alive = true;
    supabase
      .from('messages').select('id, user_id, body, created_at, profiles(display_name, color)')
      .eq('board_id', boardId).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => {
        if (!alive || !data) return;
        const rows = (data as unknown as Msg[]).reverse();
        rows.forEach((m) => m.profiles && authors.current.set(m.user_id, m.profiles));
        setMsgs(rows);
      });

    const ch = supabase
      .channel(`chat:${boardId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `board_id=eq.${boardId}` }, async (p) => {
        const m = p.new as Msg;
        let a = authors.current.get(m.user_id);
        if (!a) {
          const { data } = await supabase.from('profiles').select('display_name, color').eq('id', m.user_id).maybeSingle();
          a = (data as Author) ?? { display_name: 'Someone', color: '#7c7b8f' };
          authors.current.set(m.user_id, a);
        }
        const msg = { ...m, profiles: a };
        setMsgs((list) => (list.some((x) => x.id === m.id) ? list : [...list, msg]));
        if (!openRef.current && m.user_id !== me.id) setUnread(true);
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [boardId, me.id]);

  useEffect(() => {
    const el = listRef.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [msgs, open]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    const { data, error } = await supabase
      .from('messages').insert({ board_id: boardId, body }).select('id, user_id, body, created_at').single();
    if (error) { onError(errMsg(error)); setText(body); return; }
    const m = { ...(data as Msg), profiles: authors.current.get(me.id)! };
    setMsgs((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  }

  const toggle = () => { setOpen(!open); setUnread(false); };

  return (
    <>
      <button className={`chat-tab${open ? ' open' : ''}`} onClick={toggle} title={open ? 'Close chat' : 'Open chat'} aria-label="Toggle chat">
        <IconChevronLeft size={18} />
        {unread && !open && <span className="unread" />}
      </button>
      <aside className={`chat${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="chat-head">
          Board chat
          <button className="icon-btn" onClick={toggle} aria-label="Close chat"><IconClose size={18} /></button>
        </div>
        <div className="chat-list" ref={listRef}>
          {msgs.length === 0 && <div className="chat-empty">No messages yet.<br />Say hi to your collaborators 👋</div>}
          {msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const cont = prev && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 120_000;
            const mine = m.user_id === me.id;
            const a = m.profiles ?? authors.current.get(m.user_id) ?? { display_name: 'Someone', color: '#7c7b8f' };
            return (
              <div key={m.id} className={`msg${mine ? ' mine' : ''}${cont ? ' cont' : ''}`}>
                <Avatar name={a.display_name} color={a.color} size={28} />
                <div className="msg-body">
                  {!cont && (
                    <div className="msg-meta">
                      {mine ? 'You' : a.display_name} · {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  <div className="bubble">{m.body}</div>
                </div>
              </div>
            );
          })}
        </div>
        <form className="chat-form" onSubmit={send}>
          <textarea
            className="input" placeholder="Message…" value={text} maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
          />
          <button className="icon-btn" aria-label="Send" disabled={!text.trim()}><IconSend size={18} /></button>
        </form>
      </aside>
    </>
  );
}
