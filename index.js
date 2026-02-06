const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = 3000;

/* ========== CONFIG ========== */
const LOGIN_URL = "https://ivas.tempnum.qzz.io/login";
const SMS_URL   = "https://ivas.tempnum.qzz.io/portal/sms/received/getsms";

const EMAIL = "shahzebjansolangi@gmail.com";
const PASSWORD = "Kamran5.";

/* ========== OTP REGEX ========== */
const OTP_REGEX = /(\d{3}-\d{3}|\b\d{4,8}\b)/;

/* ========== SERVICE DETECTOR ========== */
function detectService(text) {
  const t = text.toLowerCase();
  if (t.includes("whatsapp")) return "WhatsApp";
  if (t.includes("telegram")) return "Telegram";
  if (t.includes("facebook")) return "Facebook";
  if (t.includes("google") || t.includes("gmail")) return "Google";
  return "Unknown";
}

/* ========== LOGIN ========== */
async function login(client) {
  const loginPage = await client.get(LOGIN_URL);
  const $ = cheerio.load(loginPage.data);
  const token = $('input[name="_token"]').val();

  await client.post(
    LOGIN_URL,
    {
      email: EMAIL,
      password: PASSWORD,
      _token: token
    },
    {
      maxRedirects: 0,
      validateStatus: s => s === 302 || s === 200
    }
  );
}

/* ========== FETCH OTP ONLY ========== */
async function fetchOtp() {
  const client = axios.create({
    withCredentials: true,
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  await login(client);

  const today = new Date().toISOString().slice(0, 10);

  const res = await client.post(SMS_URL, {
    from: today,
    to: today
  });

  const $ = cheerio.load(res.data);
  const cards = $(".card-body");

  let results = [];

  cards.each((_, el) => {
    const message = $(el).text().trim();
    const otpMatch = message.match(OTP_REGEX);
    if (!otpMatch) return;

    results.push({
      time: new Date().toISOString().replace("T", " ").slice(0, 19),
      country: "Unknown",
      number: "Hidden",
      service: detectService(message),
      otp: otpMatch[1],
      message
    });
  });

  return results;
}

/* ========== API ROUTE ========== */
app.get("/api/otp", async (req, res) => {
  try {
    const data = await fetchOtp();
    res.json({
      success: true,
      total: data.length,
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* ========== START SERVER ========== */
app.listen(PORT, () => {
  console.log(`✅ OTP API running → http://localhost:${PORT}/api/otp`);
});
