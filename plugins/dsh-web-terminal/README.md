# dsh-web-terminal

WebSocket-to-PTY bridge plugin for DeepSeek Harness web GUI.

## Overview

This plugin provides interactive terminal sessions in the web GUI via WebSocket. It bypasses the batch-oriented `TerminalSessionService` and directly uses `SubprocessTerminalHandle` for real-time streaming I/O.

## Architecture

```
Browser                              Server
┌──────────────┐                 ┌─────────────────────┐
│ xterm.js     │                 │ dsh-web-terminal     │
│   ↓ onData   │ ── WebSocket → │   ↓ terminal.write() │
│   ↑ write    │ ← WebSocket ── │   ↑ on('data')       │
└──────────────┘                 │        ↓             │
                                 │ SubprocessTerminal   │
                                 │ Handle (node-pty)    │
                                 └─────────────────────┘
```

## WebSocket Protocol

### Client → Server

```json
{ "type": "spawn", "cols": 80, "rows": 24, "cwd": "/path" }
{ "type": "input", "data": "ls -la\r" }
{ "type": "resize", "cols": 120, "rows": 40 }
{ "type": "close" }
```

### Server → Client

```json
{ "type": "spawned", "sessionId": "web-pty-1" }
{ "type": "output", "data": "...\x1b[..." }
{ "type": "exit", "exitCode": 0 }
{ "type": "error", "error": "message" }
```

## Configuration

```yaml
plugins:
  - name: dsh-web-terminal
    config:
      wsPath: /ws/terminal  # default
      defaultCols: 80       # default
      defaultRows: 24       # default
```

## Dependencies

- `ws` (WebSocket library)
- `node-pty` (via subprocess layer)

## Installation

```bash
# Symlink to plugins directory
ln -s /path/to/dsh-web-terminal ~/.dsh/plugins/dsh-web-terminal
```
