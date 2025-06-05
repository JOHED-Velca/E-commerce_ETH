const axios = require('axios');

const plate = process.argv[2] || 'czcl340';
const ticket = process.argv[3] || 'PM451052';

axios.post('http://localhost:3000/enqueue', {
  plateNum: plate,
  ticketNum: ticket
}).then(res => {
  console.log(res.data);
}).catch(err => {
  if (err.response) {
    console.error('Error:', err.response.status, err.response.data);
  } else {
    console.error('Error:', err.message);
  }
});

