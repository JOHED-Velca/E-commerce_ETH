const Redis = require('ioredis');
const express = require('express');
const redis = new Redis();

async function enqueueAndWait(violation_num, plate_num) {
    // Create a unique ticket id (timestamp + random)
    const ticketId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const ticket = {
        id: ticketId,
        violation_num,
        plate_num
    };

    // Push ticket to queue
    await redis.lpush('tickets_queue', JSON.stringify(ticket));

    // Poll for result
    while (true) {
        const result = await redis.hgetall(`ticket_result:${ticketId}`);
        if (result && result.status) {
            console.log('Ticket result:', result);
            break;
        }
        await new Promise(res => setTimeout(res, 1000));
    }
    redis.disconnect();
}

// Express server to accept requests
const app = express();
app.use(express.json());

app.post('/fetch-ticket', async (req, res) => {
    const { violation_num, plate_num } = req.body;
    if (!violation_num || !plate_num) {
        return res.status(400).json({ message: 'Missing violation_num or plate_num' });
    }
    // Create a unique ticket id
    const ticketId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const ticket = { id: ticketId, violation_num, plate_num };
    await redis.lpush('tickets_queue', JSON.stringify(ticket));

    // Poll for result
    while (true) {
        const result = await redis.hgetall(`ticket_result:${ticketId}`);
        if (result && result.status) {
            if (result.status === 'error') {
                // Only return { error: true, message }
                let errorMsg = '';
                try {
                    const resp = JSON.parse(result.response);
                    errorMsg = resp && resp.message ? resp.message : String(resp);
                } catch {
                    errorMsg = result.response || 'Unknown error';
                }
                return res.status(500).json({ error: true, message: errorMsg });
            } else {
                // Only return error responses, so return 404 if not error
                return res.status(404).json({ error: true, message: 'Not an error' });
            }
        }
        await new Promise(res => setTimeout(res, 1000));
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Express server listening on port ${PORT}`);
});

// For direct script usage
if (require.main === module) {
    enqueueAndWait("PM45105", "czcl34");
}
