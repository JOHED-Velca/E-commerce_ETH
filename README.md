# ft-toronto

This project contains scripts and a Chrome extension for automating Toronto parking ticket lookups.

## API Test

Run `node send_ticket.js [PLATE] [TICKET]` to enqueue a lookup request on the
local server and poll for the result via REST. Defaults are `czcl340` and
`PM451052`.

Start the server with `node socket_server.js` and enable the browser extension.
