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

def fetch_ticket_result(plate_num: str, ticket_num: str,
                        base_url: str = "http://localhost:3000",
                        timeout: float = 60.0) -> dict:
    """
    Enqueue a (ticket_num, plate_num) pair via REST and poll until the result is ready
    or until the timeout is reached. Returns the 'response' payload as a dict.

    Args:
        plate_num (str): The plate number to enqueue.
        ticket_num (str): The ticket number to enqueue.
        base_url (str): Base URL of the ticket-processing server (default http://localhost:3000).
        timeout (float): Maximum seconds to wait for the result (default 60).

    Returns:
        dict: The JSON payload under "response" from the server.

    Raises:
        TicketEnqueueError: If the initial POST /enqueue fails (e.g. duplicate or other 4xx/5xx).
        TicketTimeoutError: If no result arrives within `timeout` seconds.
        TicketFetchError: If GET /result returns an unexpected status (not 200 or 404).
    """
    enqueue_url = f"{base_url}/enqueue"
    result_url = f"{base_url}/result/{ticket_num}/{plate_num}"

    # 1) Enqueue the ticket
    try:
        resp = requests.post(
            enqueue_url,
            json={"plateNum": plate_num, "ticketNum": ticket_num},
            timeout=10  # short timeout for the enqueue call
        )
    except requests.RequestException as e:
        raise TicketEnqueueError(f"Failed to enqueue ticket: {e}")

    if resp.status_code == 409:
        # Duplicate entry or already processed
        raise TicketEnqueueError(f"Enqueue conflict (duplicate): {resp.json()}")
    elif not resp.ok:
        # Any other HTTP error
        try:
            detail = resp.json()
        except ValueError:
            detail = resp.text
        raise TicketEnqueueError(f"Enqueue failed (HTTP {resp.status_code}): {detail}")

    # 2) Poll for the result every 1 second until timeout
    start_time = time.monotonic()
    while True:
        elapsed = time.monotonic() - start_time
        if elapsed >= timeout:
            raise TicketTimeoutError(f"Timeout after {timeout:.0f} seconds waiting for result")

        try:
            r = requests.get(result_url, timeout=10)
        except requests.RequestException as e:
            raise TicketFetchError(f"Error fetching result: {e}")

        if r.status_code == 200:
            # Successful response; parse and return the "response" field
            try:
                data = r.json()
                return data
            except ValueError:
                raise TicketFetchError("Result endpoint returned invalid JSON")
        elif r.status_code == 404:
            # Not ready yet; sleep and retry
            time.sleep(1.0)
            continue
        else:
            # Unexpected status code
            try:
                detail = r.json()
            except ValueError:
                detail = r.text
            raise TicketFetchError(f"Unexpected HTTP {r.status_code} from result endpoint: {detail}")


if __name__ == '__main__':
    # Test values: replace with real plate/ticket if needed
    test_plate = "czcl340"
    test_ticket = "PM451052"

    print(f"Enqueuing ticket {test_ticket} for plate {test_plate} and waiting up to 60 seconds for a result...")
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