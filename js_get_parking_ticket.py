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

def fetch_ticket_result(
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
        TicketFetchError: If GET /ticket returns an unexpected status code (other than 404 or 200).
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
        raise TicketEnqueueError(f"Failed to enqueue ticket: {e}")

    if resp.status_code == 409:
        # Duplicate or already processed
        raise TicketEnqueueError(f"Enqueue conflict (duplicate or already processed): {resp.json()}")
    elif not resp.ok:
        # Any other HTTP error
        try:
            detail = resp.json()
        except ValueError:
            detail = resp.text
        raise TicketEnqueueError(f"Enqueue failed (HTTP {resp.status_code}): {detail}")

    # 2) Poll /ticket until 'completed' or timeout
    start_time = time.monotonic()
    while True:
        elapsed = time.monotonic() - start_time
        if elapsed >= timeout:
            raise TicketTimeoutError(f"Timeout after {timeout:.0f} seconds waiting for result")

        try:
            r = requests.get(ticket_url, timeout=10)
        except requests.RequestException as e:
            raise TicketFetchError(f"Error fetching ticket status: {e}")

        if r.status_code == 404:
            # Not yet in server’s Map (either not enqueued yet or removed). 
            # Wait and retry.
            time.sleep(1.0)
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

        # Any other status is an unexpected error
        try:
            detail = r.json()
        except ValueError:
            detail = r.text
        raise TicketFetchError(f"Unexpected HTTP {r.status_code} from /ticket: {detail}")


if __name__ == '__main__':
    # Quick test with dummy values (replace with a real plate/ticket to test)
    test_plate = "ABC1234"
    test_ticket = "PARK5678"
    print(f"Enqueuing ticket {test_ticket} for plate {test_plate}, waiting up to 60s for result...")
    try:
        result = fetch_ticket_result(test_plate, test_ticket, base_url="http://localhost:3000", timeout=60.0)
        print("Result received:")
        print(result)
    except TicketEnqueueError as e:
        print(f"Enqueue error: {e}")
    except TicketTimeoutError as e:
        print(f"Timeout error: {e}")
    except TicketFetchError as e:
        print(f"Fetch error: {e}")
