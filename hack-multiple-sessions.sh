#!/bin/bash

# WAHA CORE Multiple Sessions Hack
# This script modifies WAHA CORE to support multiple sessions

CONTAINER_NAME="waha-test"
JS_FILE="/app/dist/core/manager.core.js"

echo "🚀 Starting WAHA CORE Multiple Sessions Hack..."

# 1. Bypass onlyDefault validation
echo "1. Bypassing onlyDefault() validation..."
docker exec $CONTAINER_NAME sh -c "sed -i 's/throw new OnlyDefaultSessionIsAllowed(name);/return;/' $JS_FILE"

# 2. Create session storage map at the beginning of SessionManagerCore
echo "2. Adding session storage map..."
docker exec $CONTAINER_NAME sh -c "sed -i '/SessionManagerCore = class/a\
    constructor(...args) {\
        super(...args);\
        this.sessions = new Map();\
        this.sessionConfigs = new Map();\
    }' $JS_FILE"

# 3. Modify exists() method to use session map
echo "3. Modifying exists() method..."
docker exec $CONTAINER_NAME sh -c "sed -i '/async exists(name) {/,/}/ {
    s/this.onlyDefault(name);/\/\/ this.onlyDefault(name);/
    s/return this.session !== DefaultSessionStatus.REMOVED;/return this.sessions.has(name) \&\& this.sessions.get(name) !== \"REMOVED\";/
}' $JS_FILE"

# 4. Modify isRunning() method
echo "4. Modifying isRunning() method..."
docker exec $CONTAINER_NAME sh -c "sed -i '/isRunning(name) {/,/}/ {
    s/this.onlyDefault(name);/\/\/ this.onlyDefault(name);/
    s/return !!this.session;/return this.sessions.has(name) \&\& !!this.sessions.get(name);/
}' $JS_FILE"

# 5. Modify upsert() method
echo "5. Modifying upsert() method..."
docker exec $CONTAINER_NAME sh -c "sed -i '/async upsert(name, config) {/,/}/ {
    s/this.onlyDefault(name);/\/\/ this.onlyDefault(name);/
    s/this.sessionConfig = config;/this.sessionConfigs.set(name, config);/
}' $JS_FILE"

echo "✅ WAHA CORE Multiple Sessions Hack completed!"
echo "🔄 Restarting container..."

docker restart $CONTAINER_NAME

echo "🎉 WAHA CORE now supports multiple sessions!"
