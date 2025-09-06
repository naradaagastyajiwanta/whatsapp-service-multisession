# WAHA CORE Multiple Sessions Hack - PowerShell Version
# This script modifies WAHA CORE to support multiple sessions

$CONTAINER_NAME = "waha-test"
$JS_FILE = "/app/dist/core/manager.core.js"

Write-Host "🚀 Starting WAHA CORE Multiple Sessions Hack..." -ForegroundColor Green

# First, let's check current container
Write-Host "Checking container status..." -ForegroundColor Yellow
docker ps | Select-String $CONTAINER_NAME

# Method 1: Direct JavaScript injection approach
Write-Host "1. Implementing comprehensive session management hack..." -ForegroundColor Cyan

# Create a comprehensive sed script to inject session map functionality
$sedScript = @"
# Add session maps to constructor
/constructor.*args.*{/a\
        this.sessionsMap = new Map();\
        this.sessionConfigsMap = new Map();\
        this.DEFAULT = 'default';

# Modify exists method
/async exists\(name\) {/,/}/ {
    /this\.onlyDefault\(name\);/d
    s/return this\.session !== DefaultSessionStatus\.REMOVED;/return this.sessionsMap.has(name);/
}

# Modify isRunning method  
/isRunning\(name\) {/,/}/ {
    /this\.onlyDefault\(name\);/d
    s/return !!this\.session;/return this.sessionsMap.has(name) \&\& this.sessionsMap.get(name) !== null;/
}

# Modify upsert method
/async upsert\(name, config\) {/,/}/ {
    /this\.onlyDefault\(name\);/d
    s/this\.sessionConfig = config;/this.sessionConfigsMap.set(name, config);/
}
"@

# Apply the hack
Write-Host "2. Applying session management modifications..." -ForegroundColor Cyan

# First, let's try a more direct approach by creating JavaScript code and injecting it
$jsHack = @'
// Inject session management into existing SessionManagerCore
(function() {
    const originalExists = SessionManagerCore.prototype.exists;
    const originalIsRunning = SessionManagerCore.prototype.isRunning;  
    const originalUpsert = SessionManagerCore.prototype.upsert;
    
    // Add session maps
    if (!SessionManagerCore.prototype.sessionsMap) {
        SessionManagerCore.prototype.sessionsMap = new Map();
        SessionManagerCore.prototype.sessionConfigsMap = new Map();
    }
    
    // Override exists
    SessionManagerCore.prototype.exists = async function(name) {
        return this.sessionsMap.has(name);
    };
    
    // Override isRunning
    SessionManagerCore.prototype.isRunning = function(name) {
        return this.sessionsMap.has(name) && this.sessionsMap.get(name) !== null;
    };
    
    // Override upsert
    SessionManagerCore.prototype.upsert = async function(name, config) {
        this.sessionConfigsMap.set(name, config);
        this.sessionsMap.set(name, 'STARTING');
    };
})();
'@

# Save the hack to a temporary file in container
docker exec $CONTAINER_NAME sh -c "cat > /tmp/session-hack.js << 'EOF'
$jsHack
EOF"

Write-Host "3. Attempting JavaScript injection hack..." -ForegroundColor Yellow

# Try to inject at the end of the manager.core.js file
docker exec $CONTAINER_NAME sh -c "echo '$jsHack' >> $JS_FILE"

Write-Host "4. Restarting container to apply changes..." -ForegroundColor Green
docker restart $CONTAINER_NAME

Start-Sleep 5

Write-Host "5. Checking container status..." -ForegroundColor Yellow  
docker ps | Select-String $CONTAINER_NAME

Write-Host "🎉 WAHA CORE Multiple Sessions Hack attempt completed!" -ForegroundColor Green
Write-Host "Try testing with different session names now." -ForegroundColor Cyan
