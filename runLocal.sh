#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/projects/support
PORT=3010 npx nodemon server.js
