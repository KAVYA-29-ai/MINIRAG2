// Centralized error handler for UI
export function handleError(error, fallbackMessage = 'An unexpected error occurred.') {
  let message = fallbackMessage;
  if (error && error.message) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }
  // Optionally log to server here
  // fetch('/api/log', { method: 'POST', body: JSON.stringify({ error: message }) });
  alert(message); // Replace with custom UI if desired
  console.error('Error:', error);
}
