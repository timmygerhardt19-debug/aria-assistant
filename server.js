require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const cron = require('node-cron');

const app = express();
app.use(express.urlencoded({ extended: true }));

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const tw = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const MY_NUM = process.env.YOUR_PHONE;
const TW_NUM = process.env.TWILIO_NUMBER;

let tasks = [], reminders = [];

const SYSTEM = `You are ARIA, a personal AI assistant delivered via SMS for a high school student. You can do three things: 1. Answer ANY question. 2. Manage a task list. 3. Set timed reminders. Current tasks: TASKS_PLACEHOLDER. Current reminders: REMINDERS_PLACEHOLDER. RULES: Keep replies SHORT, this is SMS. For adding a task start reply with [ADD_TASK:name|pri:high/med/low]. For a reminder start with [ADD_REMINDER:taskname|time:HH:MM]. For marking done start with [DONE:taskname]. Be friendly and encouraging.`;

app.post('/webhook', async (req, res) => {
  const userText = req.body.Body || '';
  const system = SYSTEM
    .replace('TASKS_PLACEHOLDER', JSON.stringify(tasks))
    .replace('REMINDERS_PLACEHOLDER', JSON.stringify(reminders));

  try {
    const msg = await ai.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: system,
      messages: [{ role: 'user', content: userText }]
    });

    const reply = msg.content[0].text;
    parseActions(reply);
    const clean = reply.replace(/\[.*?\]/g, '').trim();

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(clean);
    res.type('text/xml').send(twiml.toString());
  } catch(e) {
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('ARIA error: ' + e.message);
    res.type('text/xml').send(twiml.toString());
  }
});

function parseActions(text) {
  const task = text.match(/\[ADD_TASK:([^|]+)\|pri:(high|med|low)\]/i);
  if (task) tasks.push({ name: task[1].trim(), pri: task[2], done: false });

  const rem = text.match(/\[ADD_REMINDER:([^|]+)\|time:(\d{1,2}:\d{2})\]/i);
  if (rem) reminders.push({ task: rem[1].trim(), time: rem[2], sent: false });

  const done = text.match(/\[DONE:([^\]]+)\]/i);
  if (done) {
    const n = done[1].toLowerCase();
    tasks.forEach(t => { if (t.name.toLowerCase().includes(n)) t.done = true; });
  }
}

cron.schedule('* * * * *', () => {
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  reminders.filter(r => r.time === hhmm && !r.sent).forEach(r => {
    tw.messages.create({ body: '⏰ ARIA: ' + r.task, from: TW_NUM, to: MY_NUM });
    r.sent = true;
  });
});

app.listen(3000, () => console.log('ARIA is running on port 3000'));
```
