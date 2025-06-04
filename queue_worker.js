const Redis = require('ioredis');
const redis = new Redis();
const { torontoParkingGetTicketAmount } = require('./toronto_parking_driverless');

async function fetchAndProcessTicket() {
    // Atomically pop a ticket from the queue
    const ticketStr = await redis.brpop('tickets_queue', 2); // 2 sec block
    if (!ticketStr) return false; // No ticket

    const ticket = JSON.parse(ticketStr[1]);
    try {
        const result = await torontoParkingGetTicketAmount(ticket.violation_num, ticket.plate_num);
        await redis.hset(`ticket_result:${ticket.id}`, 'status', 'done', 'response', JSON.stringify(result));
    } catch (e) {
        await redis.hset(`ticket_result:${ticket.id}`, 'status', 'error', 'response', JSON.stringify({ error: e.message }));
    }
    return true;
}

async function workerLoop() {
    while (true) {
        const found = await fetchAndProcessTicket();
        if (!found) {
            await new Promise(res => setTimeout(res, 2000));
        }
    }
}

workerLoop();
