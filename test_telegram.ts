import 'dotenv/config';
import fetch from 'node-fetch';

const token = process.env.TELEGRAM_TOKEN!;
const chat = process.env.TELEGRAM_CHAT_ID!;
const text = `✅ Telegram test:\nBot can post to ${chat}\nTime: ${new Date().toISOString()}`;

(async () => {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: 'true' })
  });
  const data = await res.json();
  if (!data.ok) {
    console.error('❌ Telegram error:', data);
    process.exit(1);
  }
  console.log('✅ Sent. Message id:', data.result?.message_id);
})();


