import time
import requests

class TicketTimeoutError(Exception):
    """Raised when a ticket result is not available within the timeout period."""
    pass

class TicketEnqueueError(Exception):
    """Raised when enqueuing a ticket fails."""
    pass

class TicketFetchError(Exception):
    """Raised when fetching a ticket result fails with an unexpected HTTP status."""
    pass

def get_parking_ticket_from_browser(
    plate_num: str,
    ticket_num: str,
    base_url: str = "http://localhost:3000",
    timeout: float = 60.0
) -> dict:
    """
    Enqueue a (ticket_num, plate_num) pair via REST and poll /ticket until the status is 'completed'
    or until timeout is reached. Returns the 'response' JSON payload once ready.

    Args:
        plate_num (str): The plate number to enqueue.
        ticket_num (str): The ticket number to enqueue.
        base_url (str): Base URL of the ticket-processing server (default http://localhost:3000).
        timeout (float): Maximum seconds to wait for the result (default 60).

    Returns:
        dict: The JSON payload under "response" from the server once status == 'completed'.

    Raises:
        TicketEnqueueError: If POST /enqueue fails (e.g. 4xx/5xx or network error).
        TicketTimeoutError: If the ticket never reaches 'completed' before timeout.
        TicketFetchError: If GET /ticket returns an unexpected status code (other than 200 or 404).
    """
    enqueue_url = f"{base_url}/enqueue"
    ticket_url = f"{base_url}/ticket/{ticket_num}/{plate_num}"

    # 1) Enqueue the ticket
    try:
        resp = requests.post(
            enqueue_url,
            json={"plateNum": plate_num, "ticketNum": ticket_num},
            timeout=10
        )
    except requests.RequestException as e:
        pass

    # 2) Poll /ticket until 'completed' or timeout
    start_time = time.monotonic()
    while True:
        elapsed = time.monotonic() - start_time
        if elapsed >= timeout:
            return None

        try:
            r = requests.get(ticket_url, timeout=10)
        except requests.RequestException as e:
            pass

        if r.status_code == 404:
            continue

        if r.status_code == 200:
            try:
                data = r.json()
            except ValueError:
                raise TicketFetchError("GET /ticket returned invalid JSON")

            status = data.get("status")
            if status == "completed":
                # Return the payload under "response"
                return data.get("response", {})
            else:
                # status is 'pending' or 'assigned'; not ready yet
                time.sleep(1.0)
                continue