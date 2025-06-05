document.getElementById('lookupButton').addEventListener('click', async () => {
  const lookupButton = document.getElementById('lookupButton');
  const resultDiv = document.getElementById('result');
  const csvFile = document.getElementById('csvFile').files[0];

  // If a CSV file is provided process each row sequentially
  if (csvFile) {
    lookupButton.disabled = true;
    resultDiv.textContent = 'Processing CSV...';
    resultDiv.style.display = 'block';
    resultDiv.className = '';
    const text = await csvFile.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const results = [];
    for (const line of lines) {
      const [ticketNum, plateNum] = line.split(',').map(s => s.trim());
      if (!ticketNum || !plateNum) continue;
      resultDiv.textContent = `Looking up ${ticketNum}/${plateNum}...`;
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'runLookup', ticketNum, plateNum }, resolve);
      });
      console.log('Lookup result for', ticketNum, plateNum, response);
      results.push({ ticketNum, plateNum, response });
    }
    lookupButton.disabled = false;
    resultDiv.textContent = `Processed ${results.length} records. Check console for details.`;
    resultDiv.className = results.some(r => r.response && r.response.error) ? 'error' : 'success';
    return;
  }

  // Single lookup using manual inputs
  const ticketNum = document.getElementById('ticketNum').value || 'PM451052';
  const plateNum = document.getElementById('plateNum').value || 'czcl340';

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