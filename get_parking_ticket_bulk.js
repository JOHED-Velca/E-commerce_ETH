// send_tickets_parallel.js
// ─────────────────────────────────────────────────────────────────────────────
// Node.js script to enqueue 10 identical test tickets in parallel
// and poll all of them until each is completed, using Promise.all.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const DEFAULT_PLATE  = 'czcl340';
const DEFAULT_TICKET = 'PM451052';

// build a list of 10 identical objects for testing
const searchList = [
    {
        plateNum:  'czcl340',
        ticketNum: 'PM451052',
    },
    {
        plateNum:  'czcl340',
        ticketNum: 'PM451053',
    },
    {
        plateNum:  'czcl340',
        ticketNum: 'PM451054',
    },
    {
        plateNum:  'czcl340',
        ticketNum: 'PM451055',
    },
    {
        plateNum:  'czcl340',
        ticketNum: 'PM451056',
    },
    {
        plateNum:  'czcl340',
        ticketNum: 'PM451057',
    },
]

const ENQUEUE_URL = 'http://localhost:3000/enqueue';
const TICKET_URL = ({ ticketNum, plateNum }) =>
  `http://localhost:3000/ticket/${ticketNum}/${plateNum}`;

async function enqueueAll() {
  const promises = searchList.map(({ ticketNum, plateNum }) =>
    axios.post(ENQUEUE_URL, { ticketNum, plateNum })
      .then(() => {
        console.log(`Enqueued ticket ${ticketNum} / plate ${plateNum}`);
      })
      .catch((err) => {
        console.error(
          `Failed to enqueue ${ticketNum}:`,
          err.response?.data || err.message
        );
        throw err;
      })
  );
  await Promise.all(promises);
  console.log(`All ${searchList.length} tickets enqueued. Starting polling...`);
}

async function pollAll() {
  const start     = Date.now();
  const timeoutMs = 60 * 1000;
  let pending     = [...searchList];

  while (pending.length > 0) {
    if (Date.now() - start > timeoutMs) {
      console.error('Timed out waiting for all tickets to complete');
      process.exit(1);
    }

    // check each pending ticket in parallel
    const results = await Promise.all(pending.map(async (item) => {
      const { ticketNum, plateNum } = item;
      try {
        const res = await axios.get(TICKET_URL(item));
        const { status, response } = res.data;
        console.log(`Ticket ${ticketNum} status: ${status}`);
        if (status === 'completed') {
          console.log(`→ Result for ${ticketNum}:`, response);
          return null;  // mark as done
        }
        return item;   // still pending
      } catch (err) {
        if (err.response?.status === 404) {
          console.error(`Ticket not found: ${ticketNum}`, err.response.data);
        } else {
          console.error(
            `Error fetching ${ticketNum}:`,
            err.response?.data || err.message
          );
        }
        return null;  // drop on error
      }
    }));

    // filter out the completed (null) ones
    pending = results.filter(x => x);
    if (pending.length > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('All tickets completed.');
  process.exit(0);
}

(async () => {
  try {
    await enqueueAll();
    await pollAll();
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
})();
