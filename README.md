# Scribblr

Blazingly fast, infinite whiteboard for note-taking, with real-time collaboration, pen-tablet support and auto-save. Runs locally with one command.

- **Infinite canvas**: pan and zoom freely; only what's on screen is drawn, so big boards stay smooth.
- **Note-taking tools**: pen, highlighter, stroke eraser, lasso, select/move, undo/redo.
- **Pen tablets**: low-latency strokes, the pen's eraser end erases, palm rejection.
- **Real-time collaboration**: live cursors, see others' strokes as they draw, avatars of who's online, group chat per board.
- **Auto-save**: instant local save that also works offline, synced to the cloud (Supabase) within a second.
- **Projects and boards**: a dashboard of projects, each with many boards; lock a board so nobody can edit it.

## Install (once)

**Linux / macOS**
```bash
git clone https://github.com/Roshan-1024/Scribblr.git && cd Scribblr
./install.sh
```

**Windows** (Command Prompt or PowerShell)
```bat
git clone https://github.com/Roshan-1024/Scribblr.git && cd Scribblr
install.cmd
```

The installer adds the `scribblr` command to your PATH. Node.js and all dependencies are downloaded automatically if they're missing.

That's it: no accounts to configure. Open Scribblr, sign up, and start drawing.

## Use

| Command | What it does |
|---|---|
| `scribblr` | Start Scribblr and open the dashboard in your browser |
| `scribblr <hash>` | Join a shared whiteboard (the board owner gets the hash from **Share**) |
| `scribblr --update` | Download the latest version (Scribblr tells you when one is available) |
| `scribblr --config` | Use your own Supabase project instead of the default (for forks) |

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

## Running your own copy

Want Scribblr with your own Supabase project? See [docs/self-hosting.md](docs/self-hosting.md).

## How it works

- **Rendering**: a custom HTML canvas engine. A spatial grid means only visible strokes are drawn, and each stroke's path is cached. A separate low-latency canvas shows the stroke you're drawing, using coalesced and predicted pointer events. The dot grid is a CSS background.
- **Data**: each board is a [Yjs](https://yjs.dev) document, a format that merges edits from several people without conflicts. It is saved instantly to IndexedDB in your browser and to Supabase (`board_docs`) about 0.8s after you stop drawing.
- **Collaboration**: Supabase Realtime broadcasts document updates, cursors and in-progress strokes, and presence shows who is online. Chat messages are rows in `messages`, delivered live through Postgres changes.
- **Security**: row-level security means you can only see boards you created or joined with a hash. Only the board creator can rename, lock or delete a board, and saves are refused while it is locked.
