// send_ticket.js
// ─────────────────────────────────────────────────────────────────────────────
// Node.js test script to enqueue a ticket and poll /ticket until it's completed.
// Updated to use GET /ticket/:ticketNum/:plateNum (instead of the old /result).
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const plate = process.argv[2] || 'czcl340';
const ticket = process.argv[3] || 'PM451052';

const ENQUEUE_URL = 'http://localhost:3000/enqueue';
const TICKET_URL = (ticketNum, plateNum) => `http://localhost:3000/ticket/${ticketNum}/${plateNum}`;

async function main() {
  try {
    // 1) Enqueue the ticket via REST
    await axios.post(ENQUEUE_URL, { plateNum: plate, ticketNum: ticket });
    console.log(`Enqueued ticket ${ticket} / plate ${plate}. Waiting for result...`);
  } catch (err) {
    if (err.response && err.response.data) {
      console.error('Enqueue failed:', err.response.data);
    } else {
      console.error('Enqueue failed:', err.message);
    }
    process.exit(1);
  }

  let timeoutId = null;

  const intervalId = setInterval(async () => {
    try {
      const res = await axios.get(TICKET_URL(ticket, plate));
      // Got a 200; check the status field
      const data = res.data;
      const status = data.status;

      if (status === 'completed') {
        console.log('Result received:', JSON.stringify(data.response, null, 2));
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        process.exit(0);
      } else {
        // status is 'pending' or 'assigned'; keep polling
        // (the server deletes the ticket entry after each GET, so re-enqueue if still pending)
        console.log(`Ticket ${ticket}|${plate} status: ${status}. Retrying...`);
      }
    } catch (err) {
      if (err.response && err.response.status === 404) {
        // Ticket not found yet (or was removed). Simply retry.
        console.log(`Ticket ${ticket}|${plate} not found yet. Retrying...`);
      } else if (err.response && err.response.data) {
        console.error('Error fetching ticket:', err.response.data);
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        process.exit(1);
      } else {
        console.error('Error fetching ticket:', err.message);
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        process.exit(1);
      }
    }
  }, 1000);

  // 3) Timeout after 60 seconds
  timeoutId = setTimeout(() => {
    console.error('Timed out waiting for result');
    clearInterval(intervalId);
    process.exit(1);
  }, 60 * 1000);
}

main();
