#!/bin/bash

# PM2 startup script for Chequemate Backend with Node 22.14.0

# Source NVM to make it available in PM2 context
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Change to the Backend directory
cd /home/ubuntu/chqm/chessplatfomr/Backend

# Use Node 22.14.0 (will read from .nvmrc if it exists)
nvm use 22.14.0

# Log the Node version being used
echo "🚀 Starting Chequemate Backend with Node version: $(node --version)"
echo "📍 Working directory: $(pwd)"
echo "🌍 Environment: $NODE_ENV"
echo "🔌 Port: $PORT"

# Start the application
exec node app.js