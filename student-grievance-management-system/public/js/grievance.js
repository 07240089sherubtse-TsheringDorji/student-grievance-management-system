document.addEventListener('DOMContentLoaded', () => {
  const description = document.querySelector('#description');
  const counter = document.querySelector('#descriptionCounter');
  if (description && counter) {
    const update = () => { counter.textContent = `${description.value.length} / 5000 characters`; };
    description.addEventListener('input', update);
    update();
  }

  const lookupButton = document.querySelector('#lookupBtn');
  const lookupInput = document.querySelector('#referenceInput');
  const lookupResult = document.querySelector('#lookupResult');
  if (lookupButton && lookupInput && lookupResult) {
    lookupButton.addEventListener('click', async () => {
      const reference = lookupInput.value.trim();
      if (!reference) {
        lookupResult.textContent = 'Enter your grievance reference ID first.';
        lookupResult.className = 'alert error';
        return;
      }
      lookupResult.textContent = 'Looking up your grievance…';
      lookupResult.className = 'alert';
      try {
        const response = await fetch(`/api/grievances/lookup/${encodeURIComponent(reference)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to find this grievance.');
        lookupResult.innerHTML = '';
        const title = document.createElement('strong');
        title.textContent = `${data.grievance.reference_id} · ${data.grievance.status}`;
        const detail = document.createElement('p');
        detail.textContent = data.grievance.title;
        lookupResult.append(title, detail);
        lookupResult.className = 'alert';
      } catch (error) {
        lookupResult.textContent = error.message;
        lookupResult.className = 'alert error';
      }
    });
  }
});
