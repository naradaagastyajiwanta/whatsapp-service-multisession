# WAHA CORE Multi-Session Implementation

## Overview

This implementation transforms WAHA CORE from a single-session architecture to support multiple WhatsApp sessions simultaneously. Each session operates independently with its own storage, configuration, and event streams.

## Key Features

✅ **Multiple Session Support**: Create and manage multiple WhatsApp sessions concurrently
✅ **Session Isolation**: Each session has isolated storage, configuration, and events  
✅ **Backward Compatibility**: Maintains compatibility with existing single-session code
✅ **Resource Management**: Proper cleanup of session resources when stopping/deleting
✅ **Session-Specific Events**: Events are properly isolated per session

## Architecture Changes

### Core Components Modified

1. **SessionManagerCore** (`src/core/manager.core.ts`)
   - Replaced single session storage with Map-based multi-session storage
   - Added session-specific resource management
   - Implemented session-isolated event streams

2. **Storage Isolation**
   - Each session uses a unique storage instance: `{engine}-{sessionName}`
   - Session files stored in separate directories: `.sessions/{engine}-{sessionName}/`
   - Individual SQLite databases per session

3. **Event Management**
   - Session-specific event streams in addition to global streams
   - Proper event filtering and routing per session
   - Clean event cleanup when sessions are stopped/deleted

### Session Lifecycle

```
Create Session → Configure → Start → Running → Stop → Delete
     ↓              ↓          ↓        ↓        ↓        ↓
  Map Entry    Config Store   Storage   Events   Cleanup  Remove
```

## API Usage

### Create Multiple Sessions

```bash
# Create session 1
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"name": "business-account", "start": false}'

# Create session 2  
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"name": "personal-account", "start": false}'
```

### List All Sessions

```bash
curl http://localhost:3000/api/sessions?all=true
```

### Start Specific Session

```bash
curl -X POST http://localhost:3000/api/sessions/business-account/start
```

### Get Session Info

```bash
curl http://localhost:3000/api/sessions/business-account
```

### Send Message from Specific Session

```bash
curl -X POST http://localhost:3000/api/business-account/sendText \
  -H "Content-Type: application/json" \
  -d '{"chatId": "1234567890@c.us", "text": "Hello from business account!"}'
```

## Configuration

Each session can have independent configuration:

```json
{
  "name": "business-account",
  "config": {
    "debug": true,
    "proxy": {
      "server": "proxy.example.com:8080",
      "username": "user",
      "password": "pass"
    },
    "webhooks": [
      {
        "url": "https://business.webhook.com/waha",
        "events": ["message"]
      }
    ],
    "metadata": {
      "account_type": "business",
      "department": "sales"
    }
  }
}
```

## Storage Structure

```
.sessions/
├── webjs-default/          # Default session (backward compatibility)
│   ├── waha.sqlite3
│   └── session-data/
├── webjs-business-account/ # Business session
│   ├── waha.sqlite3
│   └── session-data/
└── webjs-personal-account/ # Personal session
    ├── waha.sqlite3
    └── session-data/
```

## Event Handling

Events are isolated per session:

```javascript
// Global events (all sessions) - backward compatibility
GET /api/events?session=business-account

// Session-specific webhooks
POST https://business.webhook.com/waha
{
  "event": "message",
  "session": "business-account",
  "data": {...}
}
```

## Resource Management

- **Memory**: Each session maintains separate in-memory state
- **Storage**: Isolated SQLite databases and file storage per session
- **Network**: Independent WhatsApp connections per session
- **Events**: Separate event streams with proper cleanup

## Testing

Run the test script to verify multi-session functionality:

```bash
node test-multi-session.js
```

Set environment variables if needed:
```bash
export WAHA_URL=http://localhost:3000
export WAHA_API_KEY=your-api-key
node test-multi-session.js
```

## Backward Compatibility

The implementation maintains full backward compatibility:

- Default session (`default`) works exactly as before
- Existing single-session code continues to work
- Global event streams remain functional
- API endpoints unchanged

## Limitations

- **WAHA CORE**: No built-in session limits (use with caution)
- **Memory Usage**: Each session consumes additional memory
- **WhatsApp Limits**: WhatsApp may limit concurrent connections per IP
- **Performance**: More sessions = higher resource usage

## Migration from Single Session

No migration required! Existing installations continue working with the default session. Simply start creating additional sessions as needed.

## Performance Considerations

1. **Memory**: ~50-100MB per additional session
2. **CPU**: Proportional to message volume across all sessions  
3. **Storage**: Each session requires separate storage space
4. **Network**: Each session maintains independent WhatsApp connection

## Troubleshooting

### Session Not Starting
```bash
# Check session status
curl http://localhost:3000/api/sessions/session-name

# Check logs
docker logs waha-container
```

### Memory Issues
```bash
# Monitor memory usage
docker stats waha-container

# Limit concurrent sessions based on available resources
```

### Storage Issues
```bash
# Check storage space
df -h

# Clean up unused sessions
curl -X DELETE http://localhost:3000/api/sessions/unused-session
```

## Security Considerations

- Each session has isolated authentication
- Session-specific proxy configurations
- Independent webhook endpoints per session
- Separate API access per session

---

**Implementation completed**: Multi-session support is now fully functional in WAHA CORE!