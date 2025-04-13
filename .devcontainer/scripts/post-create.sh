#!/bin/bash

# Change cache to avoid filling devcontainer storage
npm config set cache /workspaces/hashbrown/.npm-cache

# Setup environment.ts file if it doesn't exist
if [ ! -f /workspaces/hashbrown/samples/smart-home/server/src/environment.ts ]; then
    echo "Creating environment.ts file"
    touch /workspaces/hashbrown/samples/smart-home/server/src/environment.ts
    echo "export const OPEN_AI_API_KEY=sk-proj-1234567890" >> /workspaces/hashbrown/samples/smart-home/server/src/environment.ts
fi

# Install Correct Node Version
# nvm install
# nvm use

# Install dependencies
# npm install