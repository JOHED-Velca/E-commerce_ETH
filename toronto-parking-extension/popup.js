document.getElementById('lookupButton').addEventListener('click', () => {
  const ticketNum = document.getElementById('ticketNum').value || 'PM451052';
  const plateNum = document.getElementById('plateNum').value || 'czcl340';
  const lookupButton = document.getElementById('lookupButton');
  const resultDiv = document.getElementById('result');

  // Disable button and show loading state
  lookupButton.disabled = true;
  resultDiv.textContent = 'Processing...';
  resultDiv.style.display = 'block';
  resultDiv.className = '';

  chrome.runtime.sendMessage({
    action: 'runLookup',
    ticketNum,
    plateNum
  }, (response) => {
    lookupButton.disabled = false;
    if (chrome.runtime.lastError) {
      resultDiv.textContent = `Error: ${chrome.runtime.lastError.message}`;
      resultDiv.className = 'error';
      console.error('Message error:', chrome.runtime.lastError.message);
      return;
    }
    if (response.error) {
      resultDiv.textContent = `Error: ${response.message}`;
      resultDiv.className = 'error';
      console.error('Lookup failed:', response.message);
    } else {
      resultDiv.textContent = `Ticket: ${response.number}\nDate: ${response.date}\nPlate: ${response.plate}\nStatus: ${response.status}\nAmount: $${response.amount}\nAction: ${response.action}`;
      resultDiv.className = 'success';
      console.log('Lookup successful:', response);
    }
  });
});