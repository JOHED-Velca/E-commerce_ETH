const axios = require('axios');

async function getToken() {
  const { data } = await axios.get('http://localhost:3000/token');
  if (!data.token) throw new Error('No token returned');
  return data.token;
}

async function fetchTicket(plate, ticket) {
  const token = await getToken();
  const url = 'https://api.toronto.ca/parking/Lookup';
  const resp = await axios.post(
    url,
    { PLATE_NUMBER: plate.toUpperCase(), TICKET: ticket.toUpperCase() },
    {
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Origin': 'https://secure.toronto.ca',
        'Referer': 'https://secure.toronto.ca/',
        'g-recaptcha-response': token
      }
    }
  );
  return resp.data;
}

if (require.main === module) {
  const plate = process.argv[2] || 'czcl340';
  const ticket = process.argv[3] || 'PM451052';
  fetchTicket(plate, ticket)
    .then(data => {
      console.log(JSON.stringify(data, null, 2));
    })
    .catch(err => {
      if (err.response) {
        console.error('Error:', err.response.status, err.response.data);
      } else {
        console.error('Error:', err.message);
      }
    });
}

module.exports = { fetchTicket };
