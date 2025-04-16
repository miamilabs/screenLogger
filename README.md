# screenLogger

A lightweight, in-browser logging utility that creates a floating, fixed-position logging panel, capturing and displaying console messages in real time. Ideal for debugging or monitoring activity on web projects without needing browser dev tools.

## Features

- Console output mirroring (`log`, `info`, `warn`, `error`, `debug`, `table`, `time`, `assert`)
- Floating or fixed logger panel with resizable dimensions
- Color-coded logs and optional pretty-print
- Keyboard navigation and UI controls
- WebSocket support for remote logging and commands
- Session/localStorage log persistence
- Global `window.onerror` capturing
- Fully configurable and extendable

## Installation

Simply include the JavaScript file in your project:

```html
<script src="screenLogger.js"></script>
```

Then, enable the logger:

```javascript
screenLogger.enable();
```

## Getting Started

```javascript
screenLogger.enable()
  .setPosition('right') // or 'top', 'bottom', 'left'
  .setLogLimit(100)
  .setTextSize('13px')
  .enableColors(true)
  .prettyPrint(true)
  .enableTimeCounter();
```

Optional: create a control panel UI for toggling features:

```javascript
screenLogger.createControlPanel();
```

## Core Concepts

- **Auto-Scroll**: Automatically scroll to the bottom on new logs.
- **Pretty Print**: Nicely formats objects/arrays.
- **WebSocket**: Remote interaction with logging panel.
- **Session Storage**: Save logs across page reloads.

## API Reference

### Lifecycle

- `enable()`  
- `disable()`  
- `pause()` / `resume()`

### Configuration

- `setLogLimit(number)`
- `setLogLevel('log', 'error', ...)`
- `setTextSize('14px')`
- `enableTimeCounter()` / `disableTimeCounter()`
- `prettyPrint(true|false)`
- `enableColors(true|false)`
- `enableConsoleLogging(true|false)`
- `enableWindowError(true|false)`

### UI & Interaction

- `setPosition('top'|'bottom'|'left'|'right')`
- `setWidth('400px')`
- `setHeight('150px')`
- `setFullscreen(true|false)`
- `toggleVisibility(true|false)`
- `clearLogs()`
- `scrollToTop()` / `scrollToBottom()` / `scrollUp()` / `scrollDown()`
- `setCustomStyle({})`
- `createControlPanel()`

### Keyboard Navigation

- `enableKeyScroll({})`
- `disableKeyScroll()`
- `setKeyConfig({ up: [38], down: [40], ... })`

### Direct Logging (alternative to console)

```javascript
screenLogger.log("Hello");
screenLogger.warn("Something went wrong");
screenLogger.error(new Error("Oops"));
```

---

## License

MIT License © 2025

