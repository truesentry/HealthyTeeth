import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const root = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.join(root, 'dist');
const clinicName = process.env.CLINIC_NAME || 'HealtlyTeeth';
const clinicEmail = process.env.CLINIC_EMAIL || 'HealthlyTeeth@gmail.com';
const services = new Set([
  'Консультація',
  'Лікування зубів',
  'Профілактика та гігієна',
  'Естетична стоматологія'
]);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};
const recentSubmissions = new Map();
const rateWindowMs = 10 * 60 * 1000;
const maxRequestsPerWindow = 5;

function respondJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(data));
}

function getTodayInKyiv() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function validateBooking(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Перевірте дані форми.';
  const fields = ['service', 'date', 'time', 'name', 'phone', 'email', 'contactMethod'];
  if (fields.some((field) => typeof value[field] !== 'string')) return 'Заповніть усі обов’язкові поля.';
  if (!services.has(value.service)) return 'Оберіть послугу зі списку.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return 'Вкажіть коректну дату.';
  const parsedDate = new Date(`${value.date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value.date) return 'Вкажіть коректну дату.';
  if (value.date < getTodayInKyiv()) return 'Оберіть сьогоднішню або майбутню дату.';
  if (!/^([01]\d|2[0-3]):(00|15|30|45)$/.test(value.time)) return 'Вкажіть час із кроком 15 хвилин.';
  if (value.name.trim().length < 3 || value.name.length > 120) return 'Перевірте поле ПІБ.';
  const phoneDigits = value.phone.replace(/\D/g, '');
  if (phoneDigits.length < 7 || phoneDigits.length > 15 || !/^[+\d() .-]+$/.test(value.phone)) return 'Перевірте номер телефону.';
  if (value.email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return 'Перевірте адресу електронної пошти.';
  if (!['phone', 'email'].includes(value.contactMethod)) return 'Оберіть спосіб зв’язку.';
  return null;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error('Заявка завелика. Перевірте введені дані.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Не вдалося прочитати заявку. Спробуйте ще раз.');
  }
}

function tooManyRequests(request) {
  const now = Date.now();
  const address = request.socket.remoteAddress || 'unknown';
  const timestamps = (recentSubmissions.get(address) || []).filter((time) => now - time < rateWindowMs);
  if (timestamps.length >= maxRequestsPerWindow) {
    recentSubmissions.set(address, timestamps);
    return true;
  }
  timestamps.push(now);
  recentSubmissions.set(address, timestamps);
  if (recentSubmissions.size > 10_000) {
    for (const [key, values] of recentSubmissions) {
      if (values.every((time) => now - time >= rateWindowMs)) recentSubmissions.delete(key);
      if (recentSubmissions.size <= 8_000) break;
    }
  }
  return false;
}

function createMailer() {
  const { SMTP_HOST, SMTP_USER, SMTP_APP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: { user: SMTP_USER, pass: SMTP_APP_PASSWORD }
  });
}

async function sendBooking(request, response) {
  if (tooManyRequests(request)) {
    respondJson(response, 429, { error: 'Забагато заявок за короткий час. Спробуйте пізніше.' });
    return;
  }

  let booking;
  try {
    booking = await readJsonBody(request);
  } catch (error) {
    respondJson(response, 400, { error: error.message });
    return;
  }

  const validationError = validateBooking(booking);
  if (validationError) {
    respondJson(response, 400, { error: validationError });
    return;
  }

  const mailer = createMailer();
  if (!mailer) {
    respondJson(response, 503, { error: 'Надсилання листів ще не налаштовано. Зверніться до клініки напряму.' });
    return;
  }

  const replyMethod = booking.contactMethod === 'email' ? 'Електронна пошта' : 'Телефон';
  const details = [
    `Послуга: ${booking.service}`,
    `Бажана дата: ${booking.date}`,
    `Бажаний час: ${booking.time}`,
    `ПІБ: ${booking.name.trim()}`,
    `Телефон: ${booking.phone.trim()}`,
    `Email: ${booking.email.trim()}`,
    `Бажаний спосіб зв’язку: ${replyMethod}`
  ].join('\n');

  try {
    await Promise.all([
      mailer.sendMail({
        from: { name: clinicName, address: process.env.SMTP_USER },
        to: clinicEmail,
        replyTo: { name: booking.name.trim(), address: booking.email.trim() },
        subject: `Нова заявка на запис — ${booking.service}`,
        text: `Нова заявка на запис до ${clinicName}\n\n${details}\n\nБажаний час очікує підтвердження клінікою.`
      }),
      mailer.sendMail({
        from: { name: clinicName, address: process.env.SMTP_USER },
        to: booking.email.trim(),
        subject: `Заявку отримано — ${clinicName}`,
        text: `Вітаємо, ${booking.name.trim()}!\n\nМи отримали вашу заявку до ${clinicName}.\n\n${details}\n\nОбрані дата й час є побажанням і ще не підтверджені. Клініка зв’яжеться з вами за обраним способом, щоб підтвердити час прийому.\n\nЦей лист підтверджує отримання заявки, а не оплату чи остаточне підтвердження запису.`,
        html: `<p>Вітаємо, ${escapeHtml(booking.name.trim())}!</p><p>Ми отримали вашу заявку до ${escapeHtml(clinicName)}.</p><ul><li>Послуга: ${escapeHtml(booking.service)}</li><li>Бажана дата: ${escapeHtml(booking.date)}</li><li>Бажаний час: ${escapeHtml(booking.time)}</li></ul><p>Обрані дата й час є побажанням і ще не підтверджені. Клініка зв’яжеться з вами за обраним способом, щоб підтвердити час прийому.</p><p>Цей лист підтверджує отримання заявки, а не оплату чи остаточне підтвердження запису.</p>`
      })
    ]);
    respondJson(response, 201, { message: 'Заявку успішно надіслано.' });
  } catch (error) {
    // Do not include email addresses, booking details, or SMTP credentials in logs.
    console.error('Booking email delivery failed:', error.code || error.name || 'unknown error');
    respondJson(response, 502, { error: 'Не вдалося надіслати листи. Спробуйте пізніше або зв’яжіться з клінікою.' });
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

async function serveStatic(urlPath, method, response) {
  const requestedFile = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  if (!['index.html', 'styles.css', 'script.js'].includes(requestedFile)) {
    respondJson(response, 404, { error: 'Сторінку не знайдено.' });
    return;
  }
  let content;
  try {
    content = await readFile(path.join(siteDir, requestedFile));
  } catch {
    respondJson(response, 500, { error: 'Не вдалося завантажити сайт.' });
    return;
  }
  response.writeHead(200, {
    'Content-Type': mimeTypes[path.extname(requestedFile)],
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': requestedFile === 'index.html' ? 'no-cache' : 'public, max-age=3600'
  });
  response.end(method === 'HEAD' ? undefined : content);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    respondJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/bookings') {
    await sendBooking(request, response);
    return;
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    await serveStatic(url.pathname, request.method, response);
    return;
  }
  respondJson(response, 405, { error: 'Метод запиту не підтримується.' });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '127.0.0.1', () => {
  console.log(`${clinicName} Node.js server listening on port ${port}`);
});
