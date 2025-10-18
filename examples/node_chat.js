const API_KEY = process.env.API_KEY || 'dev-key';
const PROMPT = process.argv.slice(2).join(' ') || '给我写一首七言绝句';

(async () => {
  const res = await fetch('http://localhost:3000/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ prompt: PROMPT }),
  });
  const json = await res.json();
  console.log(json);
})();
