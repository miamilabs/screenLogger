var xmediaLogger = xmediaLogger || (function () {
    'use strict'; // Enforce stricter parsing and error handling

    // --- Configuration & State ---

    var version = '1.1.0'; // Logger version
    var loggerId = 'console-log-div';
    var loggerTextId = 'console-log-text';
    var controlPanelId = 'logger-control-panel';
    var isEnabled = false; // Track if the logger is currently active
    var isInitialized = false; // Track if the DOM elements have been created
    var isPaused = false; // Flag to pause logging output

    // Log appearance & limits
    var logLimit = 50; // Increased default limit
    var textSize = '13px'; // Slightly smaller default
    var isColorsEnabled = false;
    var isPrettyPrintEnabled = false;
    var isTimeCounterEnabled = false;
    var timeCounterInterval = null;

    // Configuration object with defaults
    var config = {
        position: 'right',       // Default position
        topBottomHeight: '150px', // Height for top/bottom positions
        sidebarWidth: '400px'     // Width for left/right positions
    };

    // Log levels
    var logLevels = ['debug', 'log', 'info', 'warn', 'error']; // Added 'info'
    var currentLogLevels = { debug: false, log: true, info: true, warn: true, error: true }; // Default levels
    var logColors = { // Default colors
        debug: '#6666ff', // Lighter blue
        log: '#333333',   // Dark grey
        info: '#0088cc',  // Info blue
        warn: '#ff9900',  // Orange
        error: '#ff3333'  // Brighter red
    };

    // Positioning & Dimensions
    var defaultPosition = 'right'; // Default position
    var isFullscreen = false;

    // Scrolling
    var isAutoScrollEnabled = true;
    var isUserScrolling = false;
    var userScrollTimeout = null;

    // Keyboard Navigation
    var isKeyScrollEnabled = false;
    var keyConfig = {
        up: [38, 87],        // Arrow Up, W
        down: [40, 83],      // Arrow Down, S
        left: [37, 65],      // Arrow Left, A
        right: [39, 68],     // Arrow Right, D
        toggle: [84],        // T key to toggle visibility
        clear: [76],         // L key to clear (with Shift modifier?) - maybe too risky
        fullscreen: [70],    // F key to toggle fullscreen
        scrollAmount: 50
    };

    // Features Toggles
    var isLoggingToConsole = true; // Mirror logs to original console
    var isWindowErrorEnabled = false; // Capture window.onerror
    var isAlreadyLogging = false; // Prevent recursive logging loops

    // Data & Timers
    var messageCounter = 0;
    var logEntries = []; // Store log objects { time, message, level, counter }
    var timers = {}; // For console.time / timeEnd

    // WebSocket
    var socket = null;
    var isWebSocketEnabled = false;
    var webSocketIP = 'localhost';
    var webSocketPort = 8080;
    var webSocketReconnectInterval = 5000; // 5 seconds
    var webSocketReconnectTimer = null;

    // Storage Logging
    var isStorageLoggingEnabled = false;
    var storageType = 'sessionStorage'; // 'localStorage' or 'sessionStorage'
    var storageKey = 'xmediaLoggerEntries';
    var storageLogLimit = 100; // Separate limit for storage

    // Original console backup
    var originalConsole = {};
    var consoleMethods = ['log', 'info', 'warn', 'error', 'debug', 'table', 'time', 'timeEnd', 'assert', 'group', 'groupCollapsed', 'groupEnd'];

    // --- Initialization & DOM ---

    // Wait for DOM ready if needed
    function _waitForDOM(callback) {
        if (document.readyState === 'complete' || (document.readyState !== 'loading' && !document.documentElement.doScroll)) {
            window.setTimeout(callback, 0); // Call async
        } else {
            var onReady = function() {
                document.removeEventListener('DOMContentLoaded', onReady);
                window.removeEventListener('load', onReady);
                callback();
            };
            document.addEventListener('DOMContentLoaded', onReady);
            window.addEventListener('load', onReady); // Fallback
        }
    }

    // Store original console methods
    function _backupConsole() {
        if (!originalConsole.log) { // Backup only once
            for (var i = 0; i < consoleMethods.length; i++) {
                var method = consoleMethods[i];
                originalConsole[method] = typeof console[method] === 'function' ? console[method].bind(console) : function() {}; // Ensure callable function exists
            }
            originalConsole.logToDiv = console.log.toDiv; // Backup custom flag if needed
        }
    }

    /**
     * Enables or disables automatic scrolling to the bottom on new log messages.
     * @param {boolean} [enable=true] - True to enable, false to disable.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function setAutoScroll(enable) {
        isAutoScrollEnabled = (enable !== false); // Default to true
        _renderLogMessage('info', ['Auto-scrolling ' + (isAutoScrollEnabled ? 'enabled' : 'disabled') + '.']);
        if (isAutoScrollEnabled) {
            scrollToBottom(); // Scroll to bottom immediately when enabling
        }
        return xmediaLogger;
    }

    // Create or retrieve the main logger container div
    function _createLoggerContainer() {
        var outer = document.getElementById(loggerId);
        if (!outer) {
            if (!document.body) {
                originalConsole.error && originalConsole.error('[xmediaLogger] Document body not found. Cannot create logger container.');
                return null;
            }
            outer = document.createElement('div');
            outer.id = loggerId;
            outer.className = loggerId; // For potential CSS targeting
            document.body.appendChild(outer);

            var style = outer.style;
            style.fontFamily = 'monospace, Consolas, Courier New, Courier';
            style.border = '1px solid #cccccc';
            style.backgroundColor = 'rgba(255, 255, 255, 0.95)'; // Slightly transparent
            style.color = '#333333';
            style.position = 'fixed';
            style.zIndex = '21a47483647'; // Max z-index
            style.overflowX = 'hidden';
            style.overflowY = 'auto';
            style.boxSizing = 'border-box'; // Include padding/border in width/height
            style.wordWrap = 'break-word'; // Prevent long strings overflowing horribly
            style.padding = '35px 10px 10px 10px'; // More top padding for controls/title
            style.display = 'block'; // Initially visible

            // Scrollbar styling (optional, might not work on all TVs)
            style.scrollbarWidth = 'thin'; // Firefox
            style.scrollbarColor = '#aaaaaa #f0f0f0'; // Firefox thumb and track
            var styleTag = document.createElement('style');
            styleTag.id = loggerId + '-style';
            styleTag.innerHTML = '#' + loggerId + '::-webkit-scrollbar {' +
                '  width: 8px;' +
                '}' +
                '#' + loggerId + '::-webkit-scrollbar-track {' +
                '  background: #f0f0f0;' +
                '}' +
                '#' + loggerId + '::-webkit-scrollbar-thumb {' +
                '  background-color: #aaaaaa;' +
                '  border-radius: 4px;' +
                '  border: 2px solid #f0f0f0;' +
                '}';
            document.head.appendChild(styleTag);

            // Add inner container for logs
            var textDiv = document.createElement('div');
            textDiv.id = loggerTextId;
            outer.appendChild(textDiv);

            // Add title/controls bar (placeholder)
            var titleBar = document.createElement('div');
            titleBar.style.position = 'absolute';
            titleBar.style.top = '0';
            titleBar.style.left = '0';
            titleBar.style.right = '0';
            titleBar.style.height = '25px';
            titleBar.style.lineHeight = '25px';
            titleBar.style.backgroundColor = '#eeeeee';
            titleBar.style.borderBottom = '1px solid #cccccc';
            titleBar.style.padding = '0 5px';
            titleBar.style.fontSize = '12px';
            titleBar.style.fontWeight = 'bold';
            titleBar.innerHTML = 'xmediaLogger v' + version +
                ' <span id="' + loggerId + '-close" style="float:right; cursor:pointer; padding: 0 5px;">&times;</span>' +
                ' <span id="' + loggerId + '-min" style="float:right; cursor:pointer; padding: 0 5px;">&minus;</span>';
            outer.appendChild(titleBar);

            var closeBtn = document.getElementById(loggerId + '-close');
            var minBtn = document.getElementById(loggerId + '-min');
            if (closeBtn) {
                closeBtn.onclick = function() { disable(); };
            }
            if (minBtn) {
                minBtn.onclick = function() { toggleVisibility(false); };
            }

            // Set initial position and size
            setPosition(config.position || defaultPosition);
            isInitialized = true;

            _addScrollEventListener(outer);
        }
        return outer;
    }

    // Retrieve or create the inner log display area
    function _getLogContainer() {
        _createLoggerContainer(); // Ensure outer exists
        return document.getElementById(loggerTextId);
    }

    // --- Logging Core ---

    // Check if a specific log level is enabled
    function _isLoggingEnabled(level) {
        return !isPaused && currentLogLevels[level] !== false; // Explicitly check for false
    }

    // Helper to safely get the logger DOM element
    function _getLoggerElement() {
        return document.getElementById(loggerId);
    }

    // Safely get style property, returns null if element doesn't exist
    function _safeGetStyle(prop) {
        var outer = _getLoggerElement();
        return outer ? outer.style[prop] : null;
    }

    // Safely set style property
    function _safeSetStyle(prop, value) {
        var outer = _getLoggerElement();
        if (outer) {
            try {
                outer.style[prop] = value;
            } catch (e) {
                // Ignore style setting errors silently, or log to original console
                originalConsole.error && originalConsole.error('[xmediaLogger] Error setting style ' + prop + ':', e);
            }
        }
    }

    // Simple pretty print function (ES5 compatible)
    function _prettyPrintObject(obj, indent, depth) {
        indent = indent || 0;
        depth = depth || 0;
        var maxDepth = 5; // Limit recursion depth
        var maxArrayLength = 50; // Limit array elements shown
        var maxStringLength = 100; // Limit string length shown

        if (depth > maxDepth) {
            return '"[Max Depth Reached]"';
        }

        var indentString = new Array(indent + 1).join('  ');
        var nextIndentString = new Array(indent + 3).join('  '); // Indent for children
        var result = '';

        if (typeof obj === 'undefined') {
            return 'undefined';
        }
        if (obj === null) {
            return 'null';
        }
        if (typeof obj === 'string') {
            if (obj.length > maxStringLength) {
                return '"' + obj.substring(0, maxStringLength) + '... (' + obj.length + ' chars)"';
            }
            // Basic escaping for control characters, quotes, and backslash
            return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
        }
        if (typeof obj !== 'object') { // Numbers, booleans
            return String(obj);
        }

        // Primitive wrapper objects (less common, but possible)
        if (obj instanceof String || obj instanceof Number || obj instanceof Boolean) {
            return '[' + (typeof obj) + ': ' + obj.valueOf() + ']';
        }

        // Date objects
        if (obj instanceof Date) {
            return '[Date: ' + obj.toISOString() + ']';
        }

        // Error objects
        if (obj instanceof Error) {
            return '[Error: ' + (obj.message || 'Unknown Error') + (obj.stack ? ('\n' + indentString + '  Stack: ' + obj.stack.split('\n').join('\n' + indentString + '  ')) : '') + ']';
        }

        // Detect cycles (simple check)
        if (obj.__xmediaLoggerVisited__) {
            return '"[Circular Reference]"';
        }
        try {
            obj.__xmediaLoggerVisited__ = true; // Mark as visited

            if (Array.isArray(obj)) {
                if (obj.length === 0) {
                    result = '[]';
                } else {
                    result = '[\n';
                    var itemsToShow = Math.min(obj.length, maxArrayLength);
                    for (var i = 0; i < itemsToShow; i++) {
                        result += nextIndentString + _prettyPrintObject(obj[i], indent + 2, depth + 1);
                        if (i < itemsToShow - 1) {
                            result += ',';
                        }
                        result += '\n';
                    }
                    if (obj.length > maxArrayLength) {
                        result += nextIndentString + '... (' + (obj.length - maxArrayLength) + ' more items)\n';
                    }
                    result += indentString + ']';
                }
            } else { // Generic object
                var keys = [];
                for (var key in obj) {
                    if (obj.hasOwnProperty(key) && key !== '__xmediaLoggerVisited__') { // Exclude our marker
                        keys.push(key);
                    }
                }

                if (keys.length === 0) {
                    result = '{}';
                } else {
                    result = '{\n';
                    for (var j = 0; j < keys.length; j++) {
                        var k = keys[j];
                        // Quote keys unless they are simple identifiers
                        var quotedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : '"' + k.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
                        result += nextIndentString + quotedKey + ': ' + _prettyPrintObject(obj[k], indent + 2, depth + 1);
                        if (j < keys.length - 1) {
                            result += ',';
                        }
                        result += '\n';
                    }
                    result += indentString + '}';
                }
            }
        } finally {
            // Clean up the marker, even if an error occurred during stringification
            delete obj.__xmediaLoggerVisited__;
        }

        return result;
    }

    // Convert any argument to a string representation
    function _convertToString(arg) {
        try {
            if (typeof arg === 'undefined') return 'undefined';
            if (arg === null) return 'null';
            if (typeof arg === 'string') return arg;
            if (typeof arg === 'function') return '[Function: ' + (arg.name || 'anonymous') + ']';
            if (arg instanceof Error) return '[Error: ' + arg.message + (arg.stack ? (' Stack: ' + arg.stack) : '') + ']';

            // Handle DOM Elements concisely
            if (arg instanceof Element) {
                var tagName = arg.tagName.toLowerCase();
                var id = arg.id ? '#' + arg.id : '';
                var classes = arg.classList && arg.classList.length > 0 ? '.' + Array.prototype.join.call(arg.classList, '.') : '';
                return '<' + tagName + id + classes + '>';
            }

            // Use pretty print for objects/arrays if enabled
            if (isPrettyPrintEnabled && typeof arg === 'object') {
                return _prettyPrintObject(arg);
            }

            // Fallback to JSON.stringify (can fail on complex objects/cycles)
            // Add spacing for basic readability even if pretty print is off
            return JSON.stringify(arg, null, 2);

        } catch (e) {
            // Handle potential errors during stringification (e.g., circular refs if pretty print fails)
            if (e instanceof TypeError && e.message.toLowerCase().indexOf('circular structure') > -1) {
                return '[Circular Object]';
            }
            // Try a simpler toString conversion as a last resort
            try {
                return String(arg);
            } catch (e2) {
                return '[Object cannot be stringified: ' + e.message + ']';
            }
        }
    }

    // Get the label and style for the log level
    function _getLogLevelMeta(level) {
        var meta = { label: '[' + level.toUpperCase() + ']', color: '#333333' };
        switch (level) {
            case 'debug': meta.color = logColors.debug || '#6666ff'; break;
            case 'log':   meta.color = logColors.log   || '#333333'; break;
            case 'info':  meta.color = logColors.info  || '#0088cc'; break;
            case 'warn':  meta.color = logColors.warn  || '#ff9900'; break;
            case 'error': meta.color = logColors.error || '#ff3333'; break;
        }
        return meta;
    }

    // Renders a single log message to the DIV
    function _renderLogMessage(level, args) {
        if (!isEnabled || isAlreadyLogging) return; // Check global enable flag
        isAlreadyLogging = true; // Prevent recursion

        try {
            if (!_isLoggingEnabled(level)) {
                return; // Exit early if level is filtered out or paused
            }

            var logDiv = _getLogContainer();
            if (!logDiv) { // Fail safe if container couldn't be created/found
                originalConsole.error && originalConsole.error('[xmediaLogger] Log container not found.');
                return;
            }

            var currentTime = new Date(); // Use Date object for formatting options later
            var messageArray = Array.prototype.slice.call(args);
            var messageText = '';

            try {
                messageText = messageArray.map(_convertToString).join(' ');
            } catch (e) {
                messageText = '[xmediaLogger] Error converting log arguments: ' + e.message;
                level = 'error'; // Treat conversion errors as errors
            }

            messageCounter++;
            var logEntry = {
                time: currentTime.getTime(), // Store timestamp as number
                message: messageText,
                level: level,
                counter: messageCounter
            };
            logEntries.push(logEntry);

            // Store log if storage logging is enabled
            if (isStorageLoggingEnabled) {
                _storeLogEntry(logEntry);
            }

            // --- DOM Manipulation ---
            var outer = _getLoggerElement();
            var shouldScroll = isAutoScrollEnabled && !isUserScrolling && outer &&
                Math.abs((outer.scrollHeight - outer.scrollTop) - outer.clientHeight) < 10; // Check if near bottom *before* adding new content

            var span = document.createElement('span');
            var levelMeta = _getLogLevelMeta(level);

            span.style.display = 'block';
            span.style.marginBottom = '5px';
            span.style.padding = '2px 4px';
            span.style.fontSize = textSize;
            span.style.lineHeight = '1.4';
            span.style.whiteSpace = 'pre-wrap'; // Preserve whitespace and wrap
            span.className = 'log-message log-level-' + level;

            // Content: Counter, Level, Timestamp, Message
            var timestampStr = isTimeCounterEnabled ? '-' + Math.round((new Date().getTime() - logEntry.time) / 1000) + 's' : _formatTimestamp(currentTime);
            var prefix = messageCounter + ') ' + levelMeta.label + ' [' + timestampStr + ']: ';
            span.textContent = prefix + messageText;

            // Apply color based on log level if colors are enabled
            if (isColorsEnabled) {
                span.style.color = levelMeta.color;
                // Optional: Add subtle background for errors/warnings
                if (level === 'error') span.style.backgroundColor = 'rgba(255, 51, 51, 0.1)';
                else if (level === 'warn') span.style.backgroundColor = 'rgba(255, 153, 0, 0.1)';
            }

            logDiv.appendChild(span);

            // Enforce DOM log limit (remove oldest elements)
            while (logDiv.childNodes.length > logLimit) {
                if (logDiv.firstChild) {
                    logDiv.removeChild(logDiv.firstChild);
                } else {
                    break; // Safety break
                }
            }
            // Enforce logEntries array limit (remove oldest data)
            if (logEntries.length > logLimit * 1.5) { // Keep a bit more history in memory than displayed
                logEntries.splice(0, logEntries.length - logLimit);
            }

            // Scroll to the latest log entry if needed
            if (shouldScroll && outer) {
                outer.scrollTop = outer.scrollHeight;
            }

            // Update relative timestamps if enabled
            if (isTimeCounterEnabled) {
                _refreshTimestamps(); // Could be optimized to only update existing ones
            }

            // Send the log message over WebSocket if enabled
            if (isWebSocketEnabled && socket && socket.readyState === WebSocket.OPEN) {
                try {
                    socket.send(JSON.stringify(logEntry)); // Send the structured log entry
                } catch (e) {
                    originalConsole.warn && originalConsole.warn('[xmediaLogger] WebSocket send error:', e);
                    // Consider disabling WS temporarily on repeated errors
                }
            }

        } catch (e) {
            // Catch errors during the rendering process itself
            originalConsole.error && originalConsole.error('[xmediaLogger] Critical error in _renderLogMessage:', e);
            isLoggingToConsole = false; // Prevent potential loops if the error is in console logging itself
            _safeSetStyle('border', '2px solid red'); // Visual indication of logger error
        } finally {
            isAlreadyLogging = false; // Release lock
        }
    }

    // Format timestamp
    function _formatTimestamp(date) {
        // Simple HH:MM:SS.ms format
        try {
            var h = ('0' + date.getHours()).slice(-2);
            var m = ('0' + date.getMinutes()).slice(-2);
            var s = ('0' + date.getSeconds()).slice(-2);
            var ms = ('00' + date.getMilliseconds()).slice(-3);
            return h + ':' + m + ':' + s + '.' + ms;
        } catch (e) {
            return '??:??:??';
        }
    }

    // Update relative timestamps for all visible log entries
    function _refreshTimestamps() {
        if (!isTimeCounterEnabled || !isInitialized) return;

        var logDiv = _getLogContainer();
        if (!logDiv) return;

        var spans = logDiv.getElementsByTagName('span');
        var currentTime = new Date().getTime();
        var logIndexOffset = logEntries.length - spans.length; // Account for logs removed from DOM but still in array

        for (var i = 0; i < spans.length; i++) {
            var span = spans[i];
            // Find corresponding entry in logEntries (might be slow for huge logs)
            // Assumption: spans are in the same order as recent logEntries
            var entryIndex = i + logIndexOffset;
            if (entryIndex >= 0 && entryIndex < logEntries.length) {
                var entry = logEntries[entryIndex];
                if (span.className.indexOf('log-message') > -1) { // Only update log message spans
                    var elapsedSeconds = Math.round((currentTime - entry.time) / 1000);
                    var levelMeta = _getLogLevelMeta(entry.level);
                    var newPrefix = entry.counter + ') ' + levelMeta.label + ' [-' + elapsedSeconds + 's]: ';
                    // Avoid fully rewriting textContent if possible for performance
                    if (span.textContent.startsWith(entry.counter + ')')) {
                        span.textContent = newPrefix + entry.message;
                    }
                }
            }
        }
    }


    // --- Console Method Overrides ---

    function _overrideConsoleMethods() {
        console.log = function() { _logWithCopy('log', arguments); };
        console.log.toDiv = true; // Maintain compatibility with checks for this flag
        console.info = function() { _logWithCopy('info', arguments); };
        console.warn = function() { _logWithCopy('warn', arguments); };
        console.error = function() { _logWithCopy('error', arguments); };
        console.debug = function() { _logWithCopy('debug', arguments); };
        console.table = _logTableWithCopy;
        console.time = _logTime;
        console.timeEnd = _logTimeEnd;
        console.assert = _logAssert;
        // Grouping (basic visual indent)
        console.group = function() { _logGroup(arguments, false); };
        console.groupCollapsed = function() { _logGroup(arguments, true); };
        console.groupEnd = _logGroupEnd;
    }

    function _restoreConsoleMethods() {
        for (var i = 0; i < consoleMethods.length; i++) {
            var method = consoleMethods[i];
            if (originalConsole[method]) {
                console[method] = originalConsole[method];
            }
        }
        if (typeof originalConsole.logToDiv !== 'undefined') {
            console.log.toDiv = originalConsole.logToDiv;
        } else {
            delete console.log.toDiv;
        }
    }

    // Generic wrapper for standard log levels
    function _logWithCopy(level, args) {
        if (isLoggingToConsole && originalConsole[level]) {
            try {
                originalConsole[level].apply(console, args);
            } catch (e) {
                // Fallback if apply fails (e.g., IE issues with console)
                originalConsole[level]('Log arguments could not be applied to original console.');
            }
        }
        if (isEnabled) { // Check global enable flag *before* rendering
            _renderLogMessage(level, args);
        }
    }

    // console.table implementation
    function _logTableWithCopy() {
        if (isLoggingToConsole && typeof originalConsole.table === 'function') {
            try {
                originalConsole.table.apply(console, arguments);
            } catch (e) { /* Ignore console errors */ }
        }
        if (!isEnabled || !_isLoggingEnabled('log')) return; // Table usually logs at 'log' level

        var data = arguments[0];
        var columns = arguments[1];

        _renderLogMessage('log', ['Rendering table...']); // Indicate table start

        try {
            var tableHtml = _createHtmlTable(data, columns);
            if (tableHtml) {
                var logDiv = _getLogContainer();
                if (logDiv) {
                    var tableContainer = document.createElement('div');
                    tableContainer.style.overflowX = 'auto'; // Allow horizontal scroll for wide tables
                    tableContainer.style.marginBottom = '5px';
                    tableContainer.innerHTML = tableHtml;
                    logDiv.appendChild(tableContainer);
                    // Scroll logic handled by _renderLogMessage implicitly adding the 'Rendering table...' line
                }
            } else {
                _renderLogMessage('warn', ['Could not render table. Invalid data or columns.']);
            }
        } catch (e) {
            _renderLogMessage('error', ['Error rendering console.table:', e.message]);
        }
    }

    // Helper to generate HTML table string (more robust than direct DOM manipulation for tables)
    function _createHtmlTable(data, specificColumns) {
        if (typeof data !== 'object' || data === null) return null;

        var isArray = Array.isArray(data);
        var rows = isArray ? data : [data]; // Handle single object or array of objects
        if (rows.length === 0) return '<span>Table data is empty.</span>';

        var columns = specificColumns || [];
        if (columns.length === 0) {
            // Auto-detect columns from all rows (more comprehensive)
            var columnSet = {};
            for (var i = 0; i < rows.length; i++) {
                if (typeof rows[i] === 'object' && rows[i] !== null) {
                    for (var key in rows[i]) {
                        if (rows[i].hasOwnProperty(key)) {
                            columnSet[key] = true;
                        }
                    }
                }
            }
            columns = [];
            for (var col in columnSet) {
                if (columnSet.hasOwnProperty(col)) {
                    columns.push(col);
                }
            }
            columns.sort(); // Consistent column order
        }

        if (columns.length === 0) return '<span>Table data has no properties to display.</span>';

        // Build HTML string (safer for complex structures, less direct DOM manipulation)
        var html = '<table border="1" style="border-collapse:collapse; margin: 5px 0; font-size: inherit;"><thead><tr>';
        html += '<th style="padding: 2px 5px;">' + (isArray ? '(index)' : '(key)') + '</th>';
        for (var j = 0; j < columns.length; j++) {
            html += '<th style="padding: 2px 5px;">' + _escapeHtml(columns[j]) + '</th>';
        }
        html += '</tr></thead><tbody>';

        for (var k = 0; k < rows.length; k++) {
            var row = rows[k];
            var indexKey = isArray ? k : Object.keys(data)[k]; // Get key if original data was an object
            html += '<tr><td style="padding: 2px 5px;"><strong>' + _escapeHtml(String(indexKey)) + '</strong></td>';
            for (var l = 0; l < columns.length; l++) {
                var colName = columns[l];
                var cellValue = (typeof row === 'object' && row !== null && row.hasOwnProperty(colName)) ? row[colName] : '';
                // Convert value to string for display, limit length
                var displayValue = _convertToString(cellValue);
                if (displayValue.length > 100) displayValue = displayValue.substring(0, 100) + '...';

                html += '<td style="padding: 2px 5px;">' + _escapeHtml(displayValue) + '</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        return html;
    }

    // Basic HTML escaping
    function _escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return unsafe; // Don't escape non-strings
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    // console.time / timeEnd
    function _logTime(label) {
        label = label || 'default';
        var now = new Date().getTime();
        if (timers[label]) {
            _logWithCopy('warn', ['Timer \'' + label + '\' already exists.']);
        }
        timers[label] = now;
        // Optionally log the start time itself
        // _renderLogMessage('debug', ['Timer \'' + label + '\' started at ' + now]);
    }

    function _logTimeEnd(label) {
        label = label || 'default';
        var endTime = new Date().getTime();
        var startTime = timers[label];

        if (!startTime) {
            _logWithCopy('warn', ['Timer \'' + label + '\' does not exist.']);
        } else {
            var duration = endTime - startTime;
            _logWithCopy('info', [label + ': ' + duration + 'ms']); // Log as 'info' level
            delete timers[label]; // Remove timer after use
        }
    }

    // console.assert
    function _logAssert(assertion) {
        if (!assertion) {
            var args = Array.prototype.slice.call(arguments, 1); // Get arguments after the assertion
            var message = 'Assertion failed';
            if (args.length > 0) {
                // Format message similar to browser console
                message += ': ' + args.map(_convertToString).join(' ');
            }
            // Log as an error
            _logWithCopy('error', [message]);

            // Optionally include stack trace if possible (difficult in pure ES5 without Error object)
            try {
                // Throwing and catching an error is a way to get a stack trace in some environments
                throw new Error(message);
            } catch (e) {
                if (e.stack) {
                    _renderLogMessage('error', ['Stack trace:', e.stack]);
                }
            }
        }
    }

    // console.group / groupCollapsed / groupEnd (Visual Indentation)
    var groupIndentLevel = 0;
    function _logGroup(args, collapsed) {
        var label = args.length > 0 ? Array.prototype.slice.call(args).map(_convertToString).join(' ') : 'Group';
        _renderLogMessage('log', ['▶ ' + label + (collapsed ? ' (collapsed)' : '')]); // Use triangle symbol
        groupIndentLevel++;
        // In a real implementation, subsequent logs would be indented.
        // This basic version just logs the group start/end.
        // Implementing visual indentation would require modifying _renderLogMessage
        // to add padding based on groupIndentLevel.
    }

    function _logGroupEnd() {
        groupIndentLevel = Math.max(0, groupIndentLevel - 1);
        _renderLogMessage('log', ['◀ Group End']);
        // Remove indentation for subsequent logs
    }


    // --- Event Handling ---

    // Global error handler
    function _handleErrorEvent(errorMsg, url, lineNumber, columnNumber, errorObj) {
        // Normalize arguments (different browsers pass different things)
        var message = errorMsg || 'Unknown error';
        var source = url || 'Unknown source';
        var line = lineNumber || 0;
        var col = columnNumber || 0;
        var stack = errorObj && errorObj.stack ? errorObj.stack : 'No stack trace available';

        if (_isLoggingEnabled('error') && isWindowErrorEnabled && isEnabled) {
            var errorInfo = [
                'UNCAUGHT ERROR: ' + message,
                'Source: ' + source + ' (' + line + ':' + col + ')',
                'Stack: ' + stack
            ];
            _renderLogMessage('error', errorInfo); // Render it to our logger
        }

        // Optionally, call the original onerror handler if it existed
        // if (typeof originalWindowOnError === 'function') {
        //     return originalWindowOnError.apply(window, arguments);
        // }

        // Return false to prevent the browser's default error handling (usually logs to console)
        // Return true to allow the browser's default handler to run as well.
        return false; // We logged it, so suppress the default if desired
    }


    // Scroll event listener
    function _addScrollEventListener(container) {
        if (!container) return;
        // Use passive listener if supported for better performance
        var options = false;
        try {
            var opts = Object.defineProperty({}, 'passive', {
                get: function() { options = { passive: true }; return true; }
            });
            window.addEventListener("testPassive", null, opts);
            window.removeEventListener("testPassive", null, opts);
        } catch (e) { options = false; }

        if (container.addEventListener) {
            container.addEventListener('scroll', _handleUserScroll, options);
        } else if (container.attachEvent) { // IE8 fallback
            container.attachEvent('onscroll', function() { _handleUserScroll.call(container); }); // Ensure 'this' context
        }
    }

    // Handle user scrolling to pause/resume auto-scroll
    function _handleUserScroll() {
        var container = this; // `this` should be the scrolling element
        if (!container || !isInitialized) return; // Safety checks

        if (userScrollTimeout) {
            clearTimeout(userScrollTimeout);
        }

        // Check if near the bottom (use a small tolerance)
        var isNearBottom = Math.abs((container.scrollHeight - container.scrollTop) - container.clientHeight) < 10;

        if (!isNearBottom) {
            isUserScrolling = true; // Mark that the user is controlling scroll
        }

        userScrollTimeout = setTimeout(function () {
            // Check again after a delay - if user stopped near bottom, re-enable autoscroll
            var isStillNearBottom = Math.abs((container.scrollHeight - container.scrollTop) - container.clientHeight) < 10;
            if (isStillNearBottom) {
                isUserScrolling = false;
            }
            userScrollTimeout = null; // Clear timeout ID
        }, 300); // Increased delay
    }

    // Keyboard event handler
    function _handleKeyDown(event) {
        if (!isKeyScrollEnabled || !isEnabled || !isInitialized) return;

        var e = event || window.event; // Cross-browser event object
        var keyCode = e.keyCode || e.which;
        var outer = _getLoggerElement();
        if (!outer) return;

        var scrollAmount = keyConfig.scrollAmount;
        var handled = false; // Flag to prevent default browser action

        // Movement/Scrolling
        if (keyConfig.up.indexOf(keyCode) !== -1) {
            scrollUp(scrollAmount); handled = true;
        } else if (keyConfig.down.indexOf(keyCode) !== -1) {
            scrollDown(scrollAmount); handled = true;
        }
            // Horizontal movement (only makes sense for left/right position)
            // else if (keyConfig.left.indexOf(keyCode) !== -1 && (defaultPosition === 'left' || defaultPosition === 'right')) {
            //     // Implement horizontal position adjustment if needed
            //     handled = true;
            // } else if (keyConfig.right.indexOf(keyCode) !== -1 && (defaultPosition === 'left' || defaultPosition === 'right')) {
            //     // Implement horizontal position adjustment if needed
            //     handled = true;
            // }

        // Actions
        else if (keyConfig.toggle && keyConfig.toggle.indexOf(keyCode) !== -1) {
            toggleVisibility(); handled = true;
        } else if (keyConfig.fullscreen && keyConfig.fullscreen.indexOf(keyCode) !== -1) {
            setFullscreen(!isFullscreen); handled = true;
        }
        // else if (keyConfig.clear && keyConfig.clear.indexOf(keyCode) !== -1) {
        //      clearLogs(); handled = true;
        // }

        if (handled) {
            if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation(); // Prevent triggering other listeners
            e.returnValue = false; // For older IE
            return false;
        }
    }

    // Add/Remove global listeners
    function _addGlobalListeners() {
        if (isKeyScrollEnabled) {
            if (window.addEventListener) {
                window.addEventListener('keydown', _handleKeyDown, false);
            } else if (window.attachEvent) {
                window.attachEvent('onkeydown', _handleKeyDown);
            }
        }
        if (isWindowErrorEnabled) {
            // window.onerror = _handleErrorEvent; // Assign directly
            // Storing the previous handler if needed:
            // originalWindowOnError = window.onerror;
            if (window.addEventListener) {
                window.addEventListener('error', _handleErrorEvent); // Preferred method
            } else {
                window.onerror = _handleErrorEvent; // Fallback
            }
        }
    }

    function _removeGlobalListeners() {
        if (window.removeEventListener) {
            window.removeEventListener('keydown', _handleKeyDown);
            window.removeEventListener('error', _handleErrorEvent);
        } else if (window.detachEvent) {
            window.detachEvent('onkeydown', _handleKeyDown);
        }
        // Restore original error handler if it was stored
        // window.onerror = originalWindowOnError;
        // Or simply remove ours if it was the fallback:
        if (window.onerror === _handleErrorEvent) {
            window.onerror = null; // Or restore original if saved
        }
    }

    // --- WebSocket Communication ---

    function initializeWebSocket() {
        if (!isWebSocketEnabled) return; // Don't initialize if not enabled
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            originalConsole.log && originalConsole.log('[xmediaLogger] WebSocket already connecting or open.');
            return; // Don't create multiple connections
        }
        // Clear any pending reconnect timer
        if (webSocketReconnectTimer) {
            clearTimeout(webSocketReconnectTimer);
            webSocketReconnectTimer = null;
        }

        if (!('WebSocket' in window)) {
            originalConsole.warn && originalConsole.warn('[xmediaLogger] WebSocket is not supported by this browser.');
            _renderLogMessage('warn', ['WebSocket is not supported.']);
            isWebSocketEnabled = false; // Disable WS if not supported
            return;
        }

        var wsURL = 'ws://' + webSocketIP + ':' + webSocketPort;
        _renderLogMessage('info', ['Attempting WebSocket connection to ' + wsURL]);

        try {
            socket = new WebSocket(wsURL);

            socket.onopen = function () {
                originalConsole.log && originalConsole.log('[xmediaLogger] WebSocket connection established to ' + wsURL);
                _renderLogMessage('info', ['WebSocket connection established.']);
                // Reset reconnect timer on successful connection
                if (webSocketReconnectTimer) {
                    clearTimeout(webSocketReconnectTimer);
                    webSocketReconnectTimer = null;
                }
                // Maybe send a 'hello' message with client info
                // socket.send(JSON.stringify({ type: 'client_hello', userAgent: navigator.userAgent }));
            };

            socket.onclose = function (event) {
                var reason = event.code + (event.reason ? ' (' + event.reason + ')' : '');
                originalConsole.log && originalConsole.log('[xmediaLogger] WebSocket connection closed. Code: ' + reason);
                _renderLogMessage('warn', ['WebSocket connection closed. Code: ' + reason]);
                socket = null; // Clear the socket object

                // Attempt to reconnect if enabled and closure was not clean (or based on config)
                if (isWebSocketEnabled && !event.wasClean) { // Reconnect on unclean close
                    _scheduleWebSocketReconnect();
                } else {
                    isWebSocketEnabled = false; // Disable if closed cleanly or reconnection is off
                }
            };

            socket.onerror = function (error) {
                originalConsole.error && originalConsole.error('[xmediaLogger] WebSocket Error: ', error);
                _renderLogMessage('error', ['WebSocket Error. See browser console for details.']);
                // Don't immediately disable, let onclose handle reconnection attempts
                // isWebSocketEnabled = false; // Optionally disable on error
                // socket = null; // Ensure socket is cleared on error too
            };

            socket.onmessage = function (event) {
                // Avoid logging received messages back to the logger to prevent loops
                originalConsole.log && originalConsole.log('[xmediaLogger] WebSocket message received:', event.data);
                handleServerMessage(event.data);
            };

        } catch (e) {
            originalConsole.error && originalConsole.error('[xmediaLogger] Failed to create WebSocket:', e);
            _renderLogMessage('error', ['Failed to create WebSocket: ' + e.message]);
            isWebSocketEnabled = false;
            _scheduleWebSocketReconnect(); // Still attempt reconnect even if initial creation failed
        }
    }

    function _scheduleWebSocketReconnect() {
        if (!isWebSocketEnabled || webSocketReconnectTimer) return; // Don't schedule if disabled or already scheduled

        _renderLogMessage('info', ['Attempting WebSocket reconnect in ' + (webSocketReconnectInterval / 1000) + 's...']);
        webSocketReconnectTimer = setTimeout(function() {
            webSocketReconnectTimer = null; // Clear timer ID before attempting connect
            initializeWebSocket();
        }, webSocketReconnectInterval);
    }

    function handleServerMessage(data) {
        try {
            var message = JSON.parse(data);
            originalConsole.log && originalConsole.log('[xmediaLogger] Processing command from server:', message.command);

            // Define commands in a more structured way
            var commands = {
                'setLogLevel': function(msg) {
                    if (msg.levels && typeof msg.levels === 'object') {
                        // Only update levels provided by the server
                        for (var level in msg.levels) {
                            if (currentLogLevels.hasOwnProperty(level)) {
                                currentLogLevels[level] = !!msg.levels[level];
                            }
                        }
                        _renderLogMessage('info', ['Log levels updated by server:', JSON.stringify(currentLogLevels)]);
                        // Update UI if control panel exists
                        _updateControlPanelUI();
                    }
                },
                'clearLogs': function() {
                    clearLogs();
                    _renderLogMessage('info', ['Logs cleared by server command.']);
                },
                'setLogLimit': function(msg) {
                    if (typeof msg.limit === 'number' && msg.limit > 0) {
                        setLogLimit(msg.limit);
                        _renderLogMessage('info', ['Log limit set to ' + msg.limit + ' by server.']);
                    }
                },
                'setTextSize': function(msg) {
                    if (typeof msg.size === 'string') {
                        setTextSize(msg.size);
                        _renderLogMessage('info', ['Text size set to ' + msg.size + ' by server.']);
                    }
                },
                'enableFeature': function(msg) {
                    if (msg.feature) {
                        switch(msg.feature) {
                            case 'timeCounter': enableTimeCounter(); break;
                            case 'prettyPrint': prettyPrint(true); break;
                            case 'colors': enableColors(true); break;
                            // Add more features here
                        }
                        _renderLogMessage('info', ['Feature "' + msg.feature + '" enabled by server.']);
                    }
                },
                'disableFeature': function(msg) {
                    if (msg.feature) {
                        switch(msg.feature) {
                            case 'timeCounter': disableTimeCounter(); break;
                            case 'prettyPrint': prettyPrint(false); break;
                            case 'colors': enableColors(false); break;
                            // Add more features here
                        }
                        _renderLogMessage('info', ['Feature "' + msg.feature + '" disabled by server.']);
                    }
                },
                'executeScript': function(msg) {
                    if (msg.script && typeof msg.script === 'string') {
                        _renderLogMessage('warn', ['Executing script from server...']);
                        try {
                            // Use Function constructor for safer evaluation than eval()
                            var scriptFunc = new Function(msg.script);
                            scriptFunc();
                            _renderLogMessage('info', ['Script executed successfully.']);
                        } catch (e) {
                            _renderLogMessage('error', ['Error executing script from server:', e.message]);
                        }
                    }
                },
                'reload': function() {
                    _renderLogMessage('warn', ['Reloading page by server command...']);
                    window.location.reload();
                },
                'ping': function() {
                    // Respond to ping to keep connection alive or check latency
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ type: 'pong', time: new Date().getTime() }));
                    }
                }
                // Add more commands as needed
            };

            if (message.command && commands[message.command]) {
                commands[message.command](message);
            } else {
                originalConsole.warn && originalConsole.warn('[xmediaLogger] Unknown command received from server:', message.command);
            }

        } catch (e) {
            originalConsole.error && originalConsole.error('[xmediaLogger] Failed to handle server message:', e, 'Data:', data);
            _renderLogMessage('error', ['Failed to parse or handle message from server.']);
        }
    }

    // --- Storage Logging ---

    function _storeLogEntry(logEntry) {
        if (!isStorageLoggingEnabled || typeof window[storageType] === 'undefined') {
            return;
        }
        try {
            var storedLogsRaw = window[storageType].getItem(storageKey);
            var storedLogs = storedLogsRaw ? JSON.parse(storedLogsRaw) : [];

            storedLogs.push(logEntry);

            // Enforce storage limit (FIFO)
            while (storedLogs.length > storageLogLimit) {
                storedLogs.shift();
            }

            window[storageType].setItem(storageKey, JSON.stringify(storedLogs));

        } catch (e) {
            // Handle potential storage errors (e.g., quota exceeded)
            originalConsole.error && originalConsole.error('[xmediaLogger] Error writing to ' + storageType + ':', e);
            _renderLogMessage('error', ['Failed to write log to ' + storageType + '. Storage might be full.']);
            // Disable storage logging automatically if it fails repeatedly?
            isStorageLoggingEnabled = false;
            _renderLogMessage('warn', ['Disabling ' + storageType + ' logging due to error.']);
        }
    }

    function _loadStoredLogs() {
        if (typeof window[storageType] === 'undefined') {
            _renderLogMessage('warn', [storageType + ' is not available in this browser.']);
            return [];
        }
        try {
            var storedLogsRaw = window[storageType].getItem(storageKey);
            return storedLogsRaw ? JSON.parse(storedLogsRaw) : [];
        } catch (e) {
            originalConsole.error && originalConsole.error('[xmediaLogger] Error reading from ' + storageType + ':', e);
            _renderLogMessage('error', ['Failed to read logs from ' + storageType + '. Data might be corrupt.']);
            // Optionally clear corrupt data:
            // window[storageType].removeItem(storageKey);
            return [];
        }
    }

    // --- UI & Controls ---

    // Set the position and default dimensions for that position
    function setPosition(position) {
        // Use the provided position or fallback to existing config
        position = position || config.position || 'right';

        // Store the position in config
        config.position = position;

        if (!isInitialized) {
            // If called before initialization, simply store the desired position
            return xmediaLogger;
        }

        var outer = _getLoggerElement();
        if (!outer) {
            return xmediaLogger;
        }

        // Log the position change for debugging
        _renderLogMessage('debug', ['Setting position to: ' + position]);

        // Clear all positioning and dimension styles
        var style = outer.style;
        style.top = '';
        style.bottom = '';
        style.left = '';
        style.right = '';
        style.width = '';
        style.height = '';
        style.borderTop = '';
        style.borderBottom = '';
        style.borderLeft = '';
        style.borderRight = '';
        style.display = 'block';

        // Apply position-specific styles
        switch (position) {
            case 'top':
                // Top bar: full width at the top with a fixed height.
                style.top = '0';
                style.left = '0';
                style.right = '0';
                style.bottom = 'auto';  // Explicitly clear bottom
                style.width = '100%';
                // Use the configured top/bottom height or a default of 150px
                style.height = config.topBottomHeight || '150px';
                style.borderBottom = '1px solid #cccccc';
                break;
            case 'bottom':
                // Bottom bar: full width at the bottom with a fixed height.
                style.bottom = '0';
                style.left = '0';
                style.right = '0';
                style.top = 'auto';  // Explicitly clear top
                style.width = '100%';
                style.height = config.topBottomHeight || '150px';
                style.borderTop = '1px solid #cccccc';
                break;
            case 'left':
                // Left sidebar: full height on the left and fixed width.
                style.left = '0';
                style.top = '0';
                style.bottom = '0';
                style.right = 'auto'; // Explicitly clear right
                style.width = config.sidebarWidth || '400px';
                style.height = '100%';
                style.borderRight = '1px solid #cccccc';
                break;
            case 'right':
            default:
                // Right sidebar: full height on the right and fixed width.
                config.position = 'right'; // Ensure we are in a valid state
                style.right = '0';
                style.top = '0';
                style.bottom = '0';
                style.left = 'auto'; // Explicitly clear left
                style.width = config.sidebarWidth || '400px';
                style.height = '100%';
                style.borderLeft = '1px solid #cccccc';
                break;
        }

        // Reset the fullscreen flag
        isFullscreen = false;

        // Adjust scroll position so that the latest logs are visible
        scrollToBottom();

        return xmediaLogger;
    }

    // Set width explicitly (useful after setting position or for custom sizing)
    function setWidth(width) {
        if (typeof width === 'string') {
            // Store the width in config based on position
            if (config.position === 'left' || config.position === 'right') {
                config.sidebarWidth = width;
            }

            if (!isFullscreen) { // Don't change width if fullscreen
                if (config.position === 'left' || config.position === 'right') {
                    _safeSetStyle('width', width);
                }
            }
        }
        return xmediaLogger;
    }

    // Set height explicitly
    function setHeight(height) {
        if (typeof height === 'string') {
            // Store the height in config based on position
            if (config.position === 'top' || config.position === 'bottom') {
                config.topBottomHeight = height;
            }

            if (!isFullscreen) {
                if (config.position === 'top' || config.position === 'bottom') {
                    _safeSetStyle('height', height);
                }
            }
        }
        return xmediaLogger;
    }

    // Toggle fullscreen mode
    function setFullscreen(enable) {
        isFullscreen = !!enable; // Coerce to boolean
        var outer = _getLoggerElement();
        if (!outer) return xmediaLogger;

        if (isFullscreen) {
            // Store previous styles before going fullscreen? Might be overkill.
            _safeSetStyle('top', '0');
            _safeSetStyle('left', '0');
            _safeSetStyle('right', '0');
            _safeSetStyle('bottom', '0');
            _safeSetStyle('width', '100%');
            _safeSetStyle('height', '100%');
            _safeSetStyle('border', 'none'); // Optional: remove border in fullscreen
        } else {
            // Restore previous position and dimensions
            setPosition(config.position); // This should re-apply the correct styles
        }
        // Ensure scroll position is reasonable after resize
        scrollToBottom();
        return xmediaLogger;
    }

    // Show or hide the logger UI
    function toggleVisibility(visible) {
        var outer = _getLoggerElement();
        if (!outer) return xmediaLogger;

        var isCurrentlyVisible = outer.style.display !== 'none';
        var show = (typeof visible === 'boolean') ? visible : !isCurrentlyVisible;

        if (show) {
            outer.style.display = 'block';
            // Maybe re-focus or scroll to bottom when showing?
            scrollToBottom();
        } else {
            outer.style.display = 'none';
        }
        // Update minimize button appearance if control panel exists
        var minBtn = document.getElementById(loggerId + '-min');
        if (minBtn) {
            minBtn.innerHTML = show ? '&minus;' : '&#9633;'; // Minus or Square symbol
        }

        return xmediaLogger;
    }

    // --- Public API Methods ---

    /**
     * Enables the xmediaLogger, overrides console methods, and creates the UI.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function enable() {
        if (isEnabled) {
            originalConsole.warn && originalConsole.warn('[xmediaLogger] Logger already enabled.');
            return xmediaLogger;
        }

        _backupConsole(); // Ensure originals are saved

        isEnabled = true;
        isPaused = false; // Ensure not paused on enable

        // Defer DOM manipulation until DOM is ready
        _waitForDOM(function() {
            _createLoggerContainer(); // Create UI elements
            if (isInitialized) {
                // Re-apply position settings after initialization
                if (config.position) {
                    setPosition(config.position);
                }

                // Rest of your existing code
                _overrideConsoleMethods();
                _addGlobalListeners();
                setAutoScroll(isAutoScrollEnabled);
                _renderLogMessage('info', ['xmediaLogger v' + version + ' enabled. Pos: ' + config.position + ', Limit: ' + logLimit]);
            } else {
                // Error handling
                originalConsole.error && originalConsole.error('[xmediaLogger] Failed to initialize UI. Disabling logger.');
                disable();
            }
        });

        return xmediaLogger;
    }

    /**
     * Disables the xmediaLogger, restores console methods, and removes the UI.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function disable() {
        if (!isEnabled) return xmediaLogger;

        _renderLogMessage('info', ['xmediaLogger disabling...']); // Log before restoring console

        isEnabled = false;
        _restoreConsoleMethods();
        _removeGlobalListeners();

        // Stop timers and intervals
        if (timeCounterInterval) {
            clearInterval(timeCounterInterval);
            timeCounterInterval = null;
        }
        if (webSocketReconnectTimer) {
            clearTimeout(webSocketReconnectTimer);
            webSocketReconnectTimer = null;
        }

        // Close WebSocket connection cleanly
        if (socket) {
            try {
                isWebSocketEnabled = false; // Prevent reconnect attempts during manual disable
                socket.close(1000, 'Logger disabled'); // 1000 = Normal closure
            } catch (e) { /* Ignore close errors */ }
            socket = null;
        }

        // Remove DOM elements
        var outerElement = _getLoggerElement();
        if (outerElement && outerElement.parentNode) {
            outerElement.parentNode.removeChild(outerElement);
        }
        var styleElement = document.getElementById(loggerId + '-style');
        if (styleElement && styleElement.parentNode) {
            styleElement.parentNode.removeChild(styleElement);
        }
        var panelElement = document.getElementById(controlPanelId);
        if (panelElement && panelElement.parentNode) {
            panelElement.parentNode.removeChild(panelElement);
        }


// Clear internal state (optional, depending on whether re-enabling should resume)
        // logEntries = [];
        // messageCounter = 0;
        // timers = {};
        isInitialized = false; // Mark as not initialized

        originalConsole.log && originalConsole.log('[xmediaLogger] Disabled.');

        return xmediaLogger;
    }

    /**
     * Pauses the rendering of new log messages to the screen logger UI.
     * Logs will still be captured in memory (and potentially WebSocket/Storage).
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function pause() {
        if (!isPaused) {
            isPaused = true;
            _renderLogMessage('info', ['Logger output paused.']);
        }
        return xmediaLogger;
    }

    /**
     * Resumes the rendering of new log messages after being paused.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function resume() {
        if (isPaused) {
            isPaused = false;
            _renderLogMessage('info', ['Logger output resumed.']);
            // Maybe refresh display or scroll to bottom?
            scrollToBottom();
        }
        return xmediaLogger;
    }

    /**
     * Sets the maximum number of log entries displayed in the UI.
     * @param {number} limit - The maximum number of lines.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function setLogLimit(limit) {
        var newLimit = parseInt(limit, 10);
        if (!isNaN(newLimit) && newLimit > 0) {
            logLimit = newLimit;
            // Enforce limit immediately on existing logs in DOM
            var logDiv = _getLogContainer();
            if (logDiv) {
                while (logDiv.childNodes.length > logLimit) {
                    if (logDiv.firstChild) {
                        logDiv.removeChild(logDiv.firstChild);
                    } else {
                        break;
                    }
                }
            }
            _renderLogMessage('info', ['Log limit set to ' + logLimit]);
        } else {
            _renderLogMessage('warn', ['Invalid log limit specified: ' + limit + '. Must be a positive number.']);
        }
        return xmediaLogger;
    }

    /**
     * Sets the active log levels. Only logs of these levels will be processed.
     * Pass level names as string arguments (e.g., setLogLevel('log', 'warn', 'error')).
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function setLogLevel(/* level1, level2, ... */) {
        var newLevels = { debug: false, log: false, info: false, warn: false, error: false };
        var args = Array.prototype.slice.call(arguments);
        var validLevelsProvided = false;

        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            // Allow passing an object like { log: true, error: true }
            var levelMap = args[0];
            for (var levelKey in levelMap) {
                if (newLevels.hasOwnProperty(levelKey)) {
                    newLevels[levelKey] = !!levelMap[levelKey];
                    validLevelsProvided = true;
                }
            }
        } else {
            // Handle string arguments
            for (var i = 0; i < args.length; i++) {
                var level = String(args[i]).toLowerCase();
                if (newLevels.hasOwnProperty(level)) {
                    newLevels[level] = true;
                    validLevelsProvided = true;
                }
            }
        }

        if (validLevelsProvided) {
            currentLogLevels = newLevels;
            _renderLogMessage('info', ['Active log levels set:', JSON.stringify(currentLogLevels)]);
            // Refresh display if filtering is active or levels changed significantly
            _refreshDisplayFromLogEntries(); // Re-apply filters based on new levels
            _updateControlPanelUI(); // Update checkboxes if panel exists
        } else {
            _renderLogMessage('warn', ['No valid log levels provided to setLogLevel. Current levels remain unchanged.']);
        }
        return xmediaLogger;
    }

    /**
     * Sets the font size for log messages.
     * @param {string} size - A valid CSS font-size value (e.g., '14px', '0.9em').
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function setTextSize(size) {
        if (typeof size === 'string' && size.length > 0) {
            textSize = size;
            // Apply immediately to existing logs (can be slow if many logs)
            var logDiv = _getLogContainer();
            if (logDiv) {
                var spans = logDiv.getElementsByTagName('span');
                for (var i = 0; i < spans.length; i++) {
                    if (spans[i].className.indexOf('log-message') > -1) {
                        spans[i].style.fontSize = textSize;
                    }
                }
            }
            _renderLogMessage('info', ['Log text size set to ' + textSize]);
        } else {
            _renderLogMessage('warn', ['Invalid text size specified: ' + size]);
        }
        return xmediaLogger;
    }

    /**
     * Enables displaying relative time elapsed since the log entry ('-Xs ago').
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function enableTimeCounter() {
        if (!isTimeCounterEnabled) {
            isTimeCounterEnabled = true;
            _renderLogMessage('info', ['Relative time counter enabled.']);
            _refreshTimestamps(); // Update immediately
            if (!timeCounterInterval) {
                timeCounterInterval = setInterval(_refreshTimestamps, 1000); // Refresh every second
            }
        }
        return xmediaLogger;
    }

    /**
     * Disables the relative time counter, showing absolute timestamps instead.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function disableTimeCounter() {
        if (isTimeCounterEnabled) {
            isTimeCounterEnabled = false;
            _renderLogMessage('info', ['Relative time counter disabled.']);
            if (timeCounterInterval) {
                clearInterval(timeCounterInterval);
                timeCounterInterval = null;
            }
            _refreshDisplayFromLogEntries(); // Redraw logs with absolute timestamps
        }
        return xmediaLogger;
    }

    /**
     * Enables or disables pretty-printing for objects and arrays.
     * @param {boolean} enable - True to enable, false to disable.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function prettyPrint(enable) {
        isPrettyPrintEnabled = !!enable;
        _renderLogMessage('info', ['Pretty printing ' + (isPrettyPrintEnabled ? 'enabled' : 'disabled') + '.']);
        // Note: This only affects *new* logs. Existing logs won't be reformatted.
        return xmediaLogger;
    }

    /**
     * Clears all log messages from the UI and the internal log buffer.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function clearLogs() {
        var logDiv = _getLogContainer();
        if (logDiv) {
            logDiv.innerHTML = ''; // Clear DOM
        }
        logEntries = []; // Clear memory buffer
        messageCounter = 0; // Reset counter
        timers = {}; // Clear active timers
        groupIndentLevel = 0; // Reset group indentation
        _renderLogMessage('info', ['Log display cleared.']); // Log the action itself
        // Clear storage if needed? Maybe add a separate method clearStoredLogs()
        // if (isStorageLoggingEnabled) {
        //     try { window[storageType] && window[storageType].removeItem(storageKey); } catch(e){}
        // }
        return xmediaLogger;
    }

    /**
     * Scrolls the log display to the top.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function scrollToTop() {
        var outer = _getLoggerElement();
        if (outer) {
            isUserScrolling = true; // Manual scroll action
            outer.scrollTop = 0;
            // No timeout needed to reset isUserScrolling, as we are at the top
            // Autoscroll only triggers when near bottom.
        }
        return xmediaLogger;
    }

    /**
     * Scrolls the log display to the bottom (latest message).
     * Also re-enables auto-scrolling.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function scrollToBottom() {
        var outer = _getLoggerElement();
        if (outer) {
            outer.scrollTop = outer.scrollHeight;
            isUserScrolling = false; // Re-enable auto-scroll by scrolling to bottom
        }
        return xmediaLogger;
    }

    /**
     * Scrolls the log display up by a specified amount (or default).
     * @param {number} [amount=50] - The number of pixels to scroll up.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function scrollUp(amount) {
        amount = typeof amount === 'number' ? amount : keyConfig.scrollAmount;
        var outer = _getLoggerElement();
        if (outer) {
            isUserScrolling = true; // Manual scroll action
            var targetPosition = Math.max(0, outer.scrollTop - amount);
            outer.scrollTop = targetPosition;
        }
        return xmediaLogger;
    }

    /**
     * Scrolls the log display down by a specified amount (or default).
     * Re-enables auto-scroll if scrolling reaches the bottom.
     * @param {number} [amount=50] - The number of pixels to scroll down.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function scrollDown(amount) {
        amount = typeof amount === 'number' ? amount : keyConfig.scrollAmount;
        var outer = _getLoggerElement();
        if (outer) {
            var targetPosition = Math.min(outer.scrollHeight - outer.clientHeight, outer.scrollTop + amount);
            outer.scrollTop = targetPosition;

            // Check if we reached the bottom after scrolling
            var isAtBottom = Math.abs((outer.scrollHeight - outer.scrollTop) - outer.clientHeight) < 5;
            isUserScrolling = !isAtBottom; // Re-enable auto-scroll only if at bottom
        }
        return xmediaLogger;
    }

    /**
     * Enables keyboard controls for scrolling and interacting with the logger.
     * @param {object} [config] - Optional configuration object overriding default keys (e.g., { up: [38], down: [40], scrollAmount: 100 }).
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function enableKeyScroll(config) {
        if (!isKeyScrollEnabled) {
            isKeyScrollEnabled = true;
            _removeGlobalListeners(); // Remove old listener if any
            if (config) {
                setKeyConfig(config); // Apply custom config if provided
            }
            _addGlobalListeners(); // Add new listener
            _renderLogMessage('info', ['Keyboard navigation enabled.']);
        }
        return xmediaLogger;
    }

    /**
     * Disables keyboard controls for the logger.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function disableKeyScroll() {
        if (isKeyScrollEnabled) {
            isKeyScrollEnabled = false;
            _removeGlobalListeners(); // Remove keyboard listener
            _addGlobalListeners(); // Re-add other listeners (like error handler) if they were enabled
            _renderLogMessage('info', ['Keyboard navigation disabled.']);
        }
        return xmediaLogger;
    }

    /**
     * Sets custom key codes for keyboard navigation actions.
     * @param {object} config - Configuration object (e.g., { up: [38, 87], down: [40], scrollAmount: 50 }).
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function setKeyConfig(config) {
        if (!config || typeof config !== 'object') {
            _renderLogMessage('warn', ['Invalid key configuration provided.']);
            return xmediaLogger;
        }

        var updated = false;
        var validKeys = ['up', 'down', 'left', 'right', 'toggle', 'clear', 'fullscreen'];
        for(var i=0; i < validKeys.length; i++){
            var key = validKeys[i];
            if (config[key] && Array.isArray(config[key])) {
                keyConfig[key] = config[key];
                updated = true;
            }
        }

        if (typeof config.scrollAmount === 'number' && config.scrollAmount > 0) {
            keyConfig.scrollAmount = config.scrollAmount;
            updated = true;
        }

        if (updated) {
            _renderLogMessage('info', ['Keyboard configuration updated.']);
        }
        return xmediaLogger;
    }

    /**
     * Enables or disables catching and logging of uncaught global JavaScript errors (window.onerror).
     * @param {boolean} [enable=true] - True to enable, false to disable.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function enableWindowError(enable) {
        var newState = (enable !== false); // Default to true
        if (newState !== isWindowErrorEnabled) {
            isWindowErrorEnabled = newState;
            _removeGlobalListeners(); // Remove existing listeners
            _addGlobalListeners(); // Add listeners based on new state
            _renderLogMessage('info', ['Window error capturing ' + (isWindowErrorEnabled ? 'enabled' : 'disabled') + '.']);
        }
        return xmediaLogger;
    }

    /**
     * Enables or disables color-coding of log messages based on their level.
     * @param {boolean} [enable=true] - True to enable, false to disable.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function enableColors(enable) {
        isColorsEnabled = (enable !== false); // Default to true
        _renderLogMessage('info', ['Log message coloring ' + (isColorsEnabled ? 'enabled' : 'disabled') + '.']);
        _refreshDisplayFromLogEntries(); // Redraw logs with new color setting
        return xmediaLogger;
    }

    /**
     * Enables or disables mirroring of log messages to the original browser console.
     * @param {boolean} [enable=true] - True to enable, false to disable.
     * @returns {object} The xmediaLogger instance for chaining.
     */
    function enableConsoleLogging(enable) {
        isLoggingToConsole = (enable !== false); // Default to true
        _renderLogMessage('info', ['Mirroring to original console ' + (isLoggingToConsole ? 'enabled' : 'disabled') + '.']);
        return xmediaLogger;
    }

    // Helper to re-render logs currently in the DOM based on filters/settings
    function _refreshDisplayFromLogEntries() {
        var logDiv = _getLogContainer();
        if (!logDiv) return;

        // Get the subset of logEntries that should be visible based on logLimit
        var startIndex = Math.max(0, logEntries.length - logLimit);
        var entriesToDisplay = logEntries.slice(startIndex);

        // Clear current DOM content
        logDiv.innerHTML = '';

        // Re-render the relevant entries
        isAlreadyLogging = true; // Prevent render loop
        try {
            for (var i = 0; i < entriesToDisplay.length; i++) {
                var entry = entriesToDisplay[i];
                // Check if level is currently enabled
                if (_isLoggingEnabled(entry.level)) {
                    // Create and append span similar to _renderLogMessage
                    var span = document.createElement('span');
                    var levelMeta = _getLogLevelMeta(entry.level);
                    var currentTime = new Date(entry.time);
                    var timestampStr = isTimeCounterEnabled ? '-' + Math.round((new Date().getTime() - entry.time) / 1000) + 's' : _formatTimestamp(currentTime);
                    var prefix = entry.counter + ') ' + levelMeta.label + ' [' + timestampStr + ']: ';

                    span.textContent = prefix + entry.message;
                    span.style.display = 'block';
                    span.style.marginBottom = '5px';
                    span.style.padding = '2px 4px';
                    span.style.fontSize = textSize;
                    span.style.lineHeight = '1.4';
                    span.style.whiteSpace = 'pre-wrap';
                    span.className = 'log-message log-level-' + entry.level;

                    if (isColorsEnabled) {
                        span.style.color = levelMeta.color;
                        if (entry.level === 'error') span.style.backgroundColor = 'rgba(255, 51, 51, 0.1)';
                        else if (entry.level === 'warn') span.style.backgroundColor = 'rgba(255, 153, 0, 0.1)';
                    }
                    logDiv.appendChild(span);
                }
            }
        } finally {
            isAlreadyLogging = false;
        }
        // Optionally apply search filter if active?
        // applySearchFilter(currentSearchTerm);
        scrollToBottom(); // Go to end after refresh
    }

    // --- Control Panel UI (Optional) ---

    function createControlPanel() {
        if (document.getElementById(controlPanelId)) {
            _renderLogMessage('warn', ['Control panel already exists.']);
            return xmediaLogger; // Avoid creating multiple panels
        }
        if (!isInitialized) {
            _renderLogMessage('warn', ['Logger not initialized. Cannot create control panel yet.']);
            return xmediaLogger;
        }

        var panel = document.createElement('div');
        panel.id = controlPanelId;

        // Basic Styling (consider moving to CSS)
        var style = panel.style;
        style.position = 'fixed';
        style.top = '10px'; // Position below logger title bar if possible
        style.right = '10px'; // Or relative to logger position?
        style.backgroundColor = 'rgba(240, 240, 240, 0.9)';
        style.border = '1px solid #bbbbbb';
        style.borderRadius = '4px';
        style.padding = '8px';
        style.zIndex = '2147483647'; // Same as logger, ensure visible
        style.fontSize = '12px';
        style.fontFamily = 'Arial, sans-serif';
        style.minWidth = '150px';
        style.boxShadow = '2px 2px 5px rgba(0,0,0,0.2)';

        // Helper to create buttons
        function createButton(text, onClick, marginRight) {
            var btn = document.createElement('button');
            btn.innerHTML = text;
            btn.style.margin = '2px';
            if (marginRight) btn.style.marginRight = marginRight + 'px';
            btn.style.padding = '3px 6px';
            btn.style.fontSize = '11px';
            btn.onclick = onClick;
            return btn;
        }

        // Row 1: Basic Controls
        var row1 = document.createElement('div');
        row1.appendChild(createButton('Clear', clearLogs));
        row1.appendChild(createButton('Bottom', scrollToBottom));
        row1.appendChild(createButton('Top', scrollToTop));
        panel.appendChild(row1);

        // Row 2: Toggles
        var row2 = document.createElement('div');
        row2.style.marginTop = '5px';
        var keyNavBtn = createButton(isKeyScrollEnabled ? 'KeyNav: On' : 'KeyNav: Off', function() {
            if (isKeyScrollEnabled) disableKeyScroll(); else enableKeyScroll();
            _updateControlPanelUI(); // Update button text
        });
        keyNavBtn.id = 'ctrl-keynav-btn';
        row2.appendChild(keyNavBtn);

        var autoScrollBtn = createButton(isAutoScrollEnabled ? 'Scroll: Auto' : 'Scroll: Manual', function() {
            setAutoScroll(!isAutoScrollEnabled);
            _updateControlPanelUI();
        });
        autoScrollBtn.id = 'ctrl-autoscroll-btn';
        row2.appendChild(autoScrollBtn);

        var colorsBtn = createButton(isColorsEnabled ? 'Colors: On' : 'Colors: Off', function() {
            enableColors(!isColorsEnabled);
            _updateControlPanelUI();
        });
        colorsBtn.id = 'ctrl-colors-btn';
        row2.appendChild(colorsBtn);

        var pauseBtn = createButton(isPaused ? 'Resume' : 'Pause', function() {
            if (isPaused) resume(); else pause();
            _updateControlPanelUI();
        });
        pauseBtn.id = 'ctrl-pause-btn';
        row2.appendChild(pauseBtn);

        panel.appendChild(row2);

        document.body.appendChild(panel);
        _renderLogMessage('info', ['Control panel created.']);

        return xmediaLogger;
    }

    // Helper to update button states in control panel if it exists
    function _updateControlPanelUI() {
        var panel = document.getElementById(controlPanelId);
        if (!panel) return;

        // Update KeyNav button
        var keyNavBtn = document.getElementById('ctrl-keynav-btn');
        if (keyNavBtn) keyNavBtn.innerHTML = isKeyScrollEnabled ? 'KeyNav: On' : 'KeyNav: Off';

        // Update AutoScroll button
        var autoScrollBtn = document.getElementById('ctrl-autoscroll-btn');
        if (autoScrollBtn) autoScrollBtn.innerHTML = isAutoScrollEnabled ? 'Scroll: Auto' : 'Scroll: Manual';

        // Update Colors button
        var colorsBtn = document.getElementById('ctrl-colors-btn');
        if (colorsBtn) colorsBtn.innerHTML = isColorsEnabled ? 'Colors: On' : 'Colors: Off';

        // Update Pause button
        var pauseBtn = document.getElementById('ctrl-pause-btn');
        if (pauseBtn) pauseBtn.innerHTML = isPaused ? 'Resume' : 'Pause';
    }

    // --- Public API ---

    // Gather all public methods into the return object
    var publicApi = {
        // Core Lifecycle
        version: version,
        enable: enable,
        disable: disable,
        pause: pause,
        resume: resume,
        isEnabled: function() { return isEnabled; }, // Getter for status

        // Configuration
        setLogLimit: setLogLimit,
        setLogLevel: setLogLevel,
        setTextSize: setTextSize,
        enableTimeCounter: enableTimeCounter,
        disableTimeCounter: disableTimeCounter,
        prettyPrint: prettyPrint,
        enableColors: enableColors,
        enableConsoleLogging: enableConsoleLogging, // Mirror to original console
        enableWindowError: enableWindowError, // Global error capture
        setConfig: function(options) { // Consolidated config method
            if (typeof options !== 'object' || options === null) return publicApi;
            _renderLogMessage('debug', ['Applying configuration:', JSON.stringify(options)]);
            if (options.logLimit !== undefined) setLogLimit(options.logLimit);
            if (options.logLevels !== undefined) setLogLevel(options.logLevels); // Pass object or array
            if (options.textSize !== undefined) setTextSize(options.textSize);
            if (options.enableTimeCounter !== undefined) options.enableTimeCounter ? enableTimeCounter() : disableTimeCounter();
            if (options.prettyPrint !== undefined) prettyPrint(options.prettyPrint);
            if (options.enableColors !== undefined) enableColors(options.enableColors);
            if (options.enableConsoleLogging !== undefined) enableConsoleLogging(options.enableConsoleLogging);
            if (options.enableWindowError !== undefined) enableWindowError(options.enableWindowError);
            if (options.position !== undefined) setPosition(options.position);
            if (options.width !== undefined) setWidth(options.width);
            if (options.height !== undefined) setHeight(options.height);
            if (options.enableKeyScroll !== undefined) options.enableKeyScroll ? enableKeyScroll(options.keyConfig) : disableKeyScroll();
            if (options.keyConfig !== undefined) setKeyConfig(options.keyConfig);
            if (options.autoScroll !== undefined) setAutoScroll(options.autoScroll);
            return publicApi;
        },

        // UI & Interaction
        setPosition: setPosition,
        setWidth: setWidth,
        setHeight: setHeight,
        setFullscreen: setFullscreen,
        toggleVisibility: toggleVisibility,
        clearLogs: clearLogs,
        scrollToTop: scrollToTop,
        scrollToBottom: scrollToBottom,
        scrollUp: scrollUp,
        scrollDown: scrollDown,
        setCustomStyle: function(styles) {
            if (!styles || typeof styles !== 'object') {
                _renderLogMessage('warn', ['Invalid styles object provided.']);
                return xmediaLogger;
            }
            var outer = _getLoggerElement();
            if (!outer) return xmediaLogger;

            for (var prop in styles) {
                if (styles.hasOwnProperty(prop)) {
                    _safeSetStyle(prop, styles[prop]);
                }
            }
            return xmediaLogger;
        },
        createControlPanel: createControlPanel,

        // Keyboard Navigation
        enableKeyScroll: enableKeyScroll,
        disableKeyScroll: disableKeyScroll,
        setKeyConfig: setKeyConfig,

        // Auto-scroll
        setAutoScroll: setAutoScroll,

        // Direct Logging Methods (if needed outside console override)
        log: function() { _logWithCopy('log', arguments); return publicApi; },
        info: function() { _logWithCopy('info', arguments); return publicApi; },
        warn: function() { _logWithCopy('warn', arguments); return publicApi; },
        error: function() { _logWithCopy('error', arguments); return publicApi; },
        debug: function() { _logWithCopy('debug', arguments); return publicApi; }
    };

    return publicApi;

})();

