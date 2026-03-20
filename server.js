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
let tasks = [];
let reminders = [];
app.post('/webhook', async (req, res) => {
  const userText = req.body.Body || '';
  const system = 'You are ARIA, a personal AI assistant via SMS. Tasks: ' + JSON.stringify(tasks) + ' Reminders: ' + JSON.stringify(reminders) + ' Rules: Keep replies short, this is SMS. To add a task write [ADD_TASK:name|pri:high/med/low] at the start. To add a reminder write [ADD_REMINDER:taskname|time:HH:MM] at the start. To mark done write [DONE:taskname] at the start. Answer any question helpfully and concisely. Be friendly.';
  try {
    const msg = await ai.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 400, system: system, messages: [{ role: 'user', content: userText }] });
    const reply = msg.content[0].text;
    const taskMatch = reply.match(/\[ADD_TASK:([^|]+)\|pri:(high|med|low)\]/i);
    if (taskMatch) tasks.push({ name: taskMatch[1].trim(), pri: taskMatch[2], done: false });
    const remMatch = reply.match(/\[ADD_REMINDER:([^|]+)\|time:(\d{1,2}:\d{2})\]/i);
    if (remMatch) reminders.push({ task: remMatch[1].trim(), time: remMatch[2], sent: false });
    const doneMatch = reply.match(/\[DONE:([^\]]+)\]/i);
    if (doneMatch) tasks.forEach(function(t) { if (t.name.toLowerCase().includes(doneMatch[1].toLowerCase())) t.done = true; });
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
cron.schedule('* * * * *', function() {
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  reminders.filter(function(r) { return r.time === hhmm && !r.sent; }).forEach(function(r) {
    tw.messages.create({ body: 'ARIA Reminder: ' + r.task, from: TW_NUM, to: MY_NUM });
    r.sent = true;
  });
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, function() { console.log('ARIA is running on port ' + PORT); });
```
