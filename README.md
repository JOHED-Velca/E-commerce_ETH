# ft-toronto

This project contains scripts and a Chrome extension for automating Toronto parking ticket lookups.

## API Test

Run `node send_ticket.js [PLATE] [TICKET]` to enqueue a lookup request on the local `socket_server.js` and wait for the response via WebSocket. Defaults are `czcl340` and `PM451052`.