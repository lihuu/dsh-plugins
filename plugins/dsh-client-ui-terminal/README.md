# dsh-client-ui-terminal

xterm.js terminal panel plugin for DeepSeek Harness web GUI.

## Overview

This plugin adds an interactive terminal panel to the Details section of the web GUI. It connects to the `dsh-web-terminal` server plugin via WebSocket.

## UI Location

The terminal appears as a tab in the Details panel (right side):

```
┌─────────┬──────────────────────┬─────────────────┐
│         │                      │  Details Panel  │
│ Sidebar │   Conversation       │  ┌───────────┐  │
│         │                      │  │ Tool Tab  │  │
│         │                      │  ├───────────┤  │
│         │                      │  │ Terminal  │  │
│         │                      │  │   Tab     │  │
│         │                      │  └───────────┘  │
└─────────┴──────────────────────┴─────────────────┘
```

## Features

- Real-time terminal I/O via WebSocket
- xterm.js rendering with WebGL acceleration
- Auto-fit to container size
- 256-color support

## Components

- `TerminalPanel` — Main panel with tab switching
- `XTerminal` — xterm.js wrapper component
- `useTerminal` — React hook for WebSocket connection

## Dependencies

- `xterm` (terminal emulator)
- `@xterm/addon-fit` (auto-fit)
- `@xterm/addon-webgl` (WebGL renderer)

## Installation

```bash
# Symlink to plugins directory
ln -s /path/to/dsh-client-ui-terminal ~/.dsh/plugins/dsh-client-ui-terminal
```
