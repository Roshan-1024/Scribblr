# Scribblr

A fast, infinite, collaborative whiteboard for note taking. You run it locally with one command; Supabase handles accounts, saving and real-time sync.

## Install (once)

**Linux / macOS**
```bash
git clone <this repo> scribblr && cd scribblr
./install.sh
```

**Windows** (Command Prompt or PowerShell)
```bat
git clone <this repo> scribblr && cd scribblr
install.cmd
```

The installer adds the `scribblr` command to your PATH. Node.js and all dependencies are downloaded automatically if they're missing.

On first run it asks for the **Supabase URL and publishable key**; get them from the Scribblr admin. They are saved to `scribblr.config.json` on your machine, which is git-ignored and never committed. Run `scribblr --config` to change them.

## Use

| Command | What it does |
|---|---|
| `scribblr` | Start Scribblr and open the dashboard in your browser |
| `scribblr <hash>` | Join a shared whiteboard (the board owner gets the hash from **Share**) |
| `scribblr --update` | Download the latest version (Scribblr tells you when one is available) |
| `scribblr --config` | Re-enter the Supabase URL and key |

Press `Ctrl+C` in the terminal to stop it. To use a different port, set `SCRIBBLR_PORT`, e.g. `SCRIBBLR_PORT=6000 scribblr`.

## Shortcuts

| Key | Action |
|---|---|
| `V` / `P` / `H` / `E` / `L` | Select / Pen / Highlighter / Eraser / Lasso |
| `Ctrl+Z`, `Ctrl+Y` (or `Ctrl+Shift+Z`) | Undo, redo (only your own changes) |
| `Delete` / `Backspace` | Delete the selection |
| `Ctrl+A` | Select all |
| Scroll / `Shift`+scroll | Pan vertically / horizontally |
| `Ctrl`+scroll, trackpad pinch | Zoom |
| `Space`+drag, middle mouse drag, two fingers | Pan |
| `Ctrl +` / `Ctrl -` / `Ctrl 0` | Zoom in / out / reset to 100% |

Pen tablets work out of the box. The pen's eraser end erases, and touch is ignored while the pen is in use (palm rejection).

## Supabase setup (admin, once)

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. Change the `admin_email` at the top first if needed. The admin account has no limits; everyone else gets 100 projects and 10 boards per project, which you can change in the `app_settings` table.
3. Run `scribblr --config` and paste the **Project URL** and **publishable key** (Project Settings → API Keys). They're stored in the git-ignored `scribblr.config.json` (format: [`scribblr.config.example.json`](scribblr.config.example.json)). Share them with collaborators privately, never through the repo. Never use the `service_role`/secret key here.
4. In **Authentication → Sign In / Providers → Email**, decide on **Confirm email**. Supabase's built-in email service only sends a few emails per hour, so either turn confirmation off or add your own SMTP server.
5. In **Authentication → Rate Limits**, adjust the sign-up limit if needed. The app also enforces a 1-minute cooldown between sign-ups on each device.

## How it works

- **Rendering**: a custom HTML canvas engine. A spatial grid means only visible strokes are drawn, and each stroke's path is cached. A separate low-latency canvas shows the stroke you're drawing, using coalesced and predicted pointer events. The dot grid is a CSS background.
- **Data**: each board is a [Yjs](https://yjs.dev) document, a format that merges edits from several people without conflicts. It is saved instantly to IndexedDB in your browser and to Supabase (`board_docs`) about 0.8s after you stop drawing.
- **Collaboration**: Supabase Realtime broadcasts document updates, cursors and in-progress strokes, and presence shows who is online. Chat messages are rows in `messages`, delivered live through Postgres changes.
- **Security**: row-level security means you can only see boards you created or joined with a hash. Only the board creator can rename, lock or delete a board, and saves are refused while it is locked.
