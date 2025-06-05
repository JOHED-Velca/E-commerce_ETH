// send_ticket.js
const axios = require('axios');

const plate = process.argv[2] || 'czcl340';
const ticket = process.argv[3] || 'PM451052';

const ENQUEUE_URL = 'http://localhost:3000/enqueue';
const RESULT_URL = (ticketNum, plateNum) => `http://localhost:3000/result/${ticketNum}/${plateNum}`;

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

  // 2) Start polling every 1 second for the result
  const intervalMs = 1000;
  let polls = 0;
  const maxPolls = 60; // 60 seconds total

  const intervalId = setInterval(async () => {
    polls += 1;

    try {
      const res = await axios.get(RESULT_URL(ticket, plate));
      // If we get here, the result is ready (status 200)
      console.log('Result received:', JSON.stringify(res.data.response, null, 2));
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      process.exit(0);
    } catch (err) {
      // If 404, result not ready yet—just continue polling
      if (err.response && err.response.status === 404) {
        // Still pending; do nothing
      } else {
        // Some other error: log and exit
        if (err.response && err.response.data) {
          console.error('Error fetching result:', err.response.data);
        } else {
          console.error('Error fetching result:', err.message);
        }
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        process.exit(1);
      }
    }
  }, intervalMs);

  // 3) Timeout after 60 seconds
  const timeoutId = setTimeout(() => {
    console.error('Timed out waiting for result');
    clearInterval(intervalId);
    process.exit(1);
  }, maxPolls * intervalMs);
}

main();
