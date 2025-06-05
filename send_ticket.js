const axios = require('axios');
const { io } = require('socket.io-client');


const plate = process.argv[2] || 'czcl340';
const ticket = process.argv[3] || 'PM451052';

const socket = io('http://localhost:3000', { transports: ['websocket'] });

socket.on('connect', async () => {
  try {
    await axios.post('http://localhost:3000/enqueue', { plateNum: plate, ticketNum: ticket });
    console.log('Enqueued ticket, waiting for result...');
  } catch (err) {
    console.error('Enqueue failed:', err.response ? err.response.data : err.message);
    process.exit(1);
  }
});

socket.on('result', (data) => {
  if (data.ticketNum === ticket && data.plateNum === plate) {
    console.log('Result received:', JSON.stringify(data.response, null, 2));
    process.exit(0);
  }
});

setTimeout(() => {
  console.error('Timed out waiting for result');
  process.exit(1);
}, 60000);
