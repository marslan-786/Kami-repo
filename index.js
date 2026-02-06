const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('libphonenumber-js');

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CONFIG ================= */

const BASE_URL = 'https://ivas.tempnum.qzz.io';
const LOGIN_URL = `${BASE_URL}/login`;
const NUMBERS_URL = `${BASE_URL}/portal/numbers`;
const SMS_URL = `${BASE_URL}/portal/sms/received/getsms`;

const USERNAME = process.env.IVAS_USER || 'shahzebjansolangi@gmail.com';
const PASSWORD = process.env.IVAS_PASS || 'Kamran5.';

/* ================= SESSION ================= */

const client = axios.create({
  timeout: 20000,
  withCredentials: true,
  headers: {
    'User-Agent': 'Mozilla/5.0'
  }
});

let cookies = '';

/* ================= HELPERS ================= */

function extractOTP(text) {
  const m =
    text.match(/\b\d{3}-\d{3}\b/) ||
    text.match(/\b\d{4,8}\b/);
  return m ? m[0] : null;
}

function getCountryFromNumber(number) {
  try {
    const phone = parsePhoneNumber('+' + number);
    return phone?.country || null;
  } catch {
    return null;
  }
}

/* ================= LOGIN ================= */

async function login() {
  const loginPage = await client.get(LOGIN_URL);
  cookies = loginPage.headers['set-cookie']?.join('; ') || '';

  const $ = cheerio.load(loginPage.data);
  const token = $('input[name="_token"]').val();

  const res = await client.post(
    LOGIN_URL,
    new URLSearchParams({
      email: USERNAME,
      password: PASSWORD,
      _token: token
    }),
    { headers: { Cookie: cookies } }
  );

  cookies += '; ' + (res.headers['set-cookie'] || []).join('; ');
  console.log('✅ Logged in');
}

/* ================= ROUTES ================= */

app.get('/', (_, res) => {
  res.send('🚀 iVAS API Running');
});

/* ===== NUMBERS API ===== */
app.get('/api/numbers', async (_, res) => {
  try {
    await login();
    const r = await client.get(NUMBERS_URL, {
      headers: { Cookie: cookies }
    });

    const $ = cheerio.load(r.data);
    const numbers = [];

    $('table tbody tr').each((_, el) => {
      const cols = $(el).find('td');
      if (cols.length >= 3) {
        numbers.push({
          country_range: $(cols[0]).text().trim(),
          number: $(cols[1]).text().trim(),
          status: $(cols[2]).text().trim()
        });
      }
    });

    res.json({
      total: numbers.length,
      data: numbers
    });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Failed to fetch numbers' });
  }
});

/* ===== SMS / OTP API ===== */
app.get('/api/sms', async (_, res) => {
  try {
    await login();

    const r = await client.post(
      SMS_URL,
      new URLSearchParams({}),
      { headers: { Cookie: cookies } }
    );

    const $ = cheerio.load(r.data);
    const messages = [];

    $('.card-body').each((_, el) => {
      const text = $(el).text().trim();
      if (!text) return;

      const numberMatch = text.match(/\b\d{8,15}\b/);
      const number = numberMatch ? numberMatch[0] : null;

      messages.push({
        time: moment().format('YYYY-MM-DD HH:mm:ss'),
        number,
        service: text.toLowerCase().includes('whatsapp')
          ? 'WhatsApp'
          : 'Unknown',
        otp: extractOTP(text),
        message: text,
        country: number ? getCountryFromNumber(number) : null
      });
    });

    res.json({
      total: messages.length,
      data: messages
    });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Failed to fetch SMS' });
  }
});

/* ================= START ================= */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
