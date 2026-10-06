# Prosper Voice Agent Builder

Build and edit healthcare voice agents in a graph editor, then test them with a
live browser call. Changes stay in memory for the current session.

## Setup

Requires Node 24, Python 3.11+, and [uv](https://docs.astral.sh/uv/).

```bash
nvm use
make install
```

Create `backend/.env` from `backend/.env.example` if it doesn't already exist.
Set `OPENAI_API_KEY` and `ELEVENLABS_API_KEY`, then run:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). Allow microphone access for Test Call.
Press **Ctrl+C** to stop.
