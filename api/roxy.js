// api/roxy.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

/* ================= CONFIG ================= */
const BASE = "http://167.114.209.78/roxy";
const USER = "Kamibroken";
const PASS = "Kamran5.";

let cookie = "";

/* ================= AXIOS CLIENT ================= */
const client = axios.create({
  baseURL: BASE,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/144 Mobile",
  },
  validateStatus: () => true,
});

/* ================= LOGIN ================= */
async function login() {
  cookie = "";

  const page = await client.get("/Login");
  const set = page.headers["set-cookie"];
  if (set) cookie = set.map(c => c.split(";")[0]).join("; ");

  const match = page.data.match(/What is (\d+) \+ (\d+)/i);
  const capt = match ? Number(match[1]) + Number(match[2]) : 6;

  const res = await client.post(
    "/signin",
    `username=${USER}&password=${PASS}&capt=${capt}`,
    {
      headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (res.headers["set-cookie"]) {
    cookie += "; " + res.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
  }
}

/* ================= CLEAN HTML ================= */
function clean(text = "") {
  return text.replace(/<[^>]+>/g, "").trim();
}

/* ================= FIX NUMBERS ================= */
function fixNumbers(data) {
  if (!data.aaData) return data;

  data.aaData = data.aaData.map(row => {
    // Auto-detect country from number
    let number = row[3] || "";
    let country = "";
    if (number.startsWith("60")) country = "Malaysia";
    else if (number.startsWith("221")) country = "Senegal";
    else if (number.startsWith("233")) country = "Ghana";
    else if (number.startsWith("212")) country = "Morocco";
    else country = "Unknown";

    return [
      `${country} - ${row[1] || "Unknown Range"}`, // Name + Range
      "", // blank column
      number,
      "Weekly",
      clean(row[4] || "Weekly$ 0.01"),
      clean(row[7] || "SD : 0 | SW : 0"),
    ];
  });

  return data;
}

/* ================= FIX SMS ================= */
function fixSMS(data) {
  if (!data.aaData) return data;

  data.aaData = data.aaData.map(row => {
    if ((!row[4] || row[4].trim() === "") && row[5]) {
      row[4] = row[5]; // OTP/message always in 4th index
    }

    row[4] = (row[4] || "").replace(/legendhacker/gi, "").trim();
    row[5] = row[5] || "";
    row[6] = row[6] || "$";
    row[7] = row[7] || 0;

    return row.slice(0, 8);
  });

  return data;
}

/* ================= FETCH NUMBERS ================= */
async function getNumbers() {
  if (!cookie) await login();

  const res = await client.get(
    "/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1",
    { headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" } }
  );

  return fixNumbers(res.data);
}

/* ================= FETCH SMS ================= */
async function getSMS() {
  if (!cookie) await login();

  const res = await client.get(
    "/agent/res/data_smscdr.php?fdate1=2020-01-01%2000:00:00&fdate2=2099-12-31%2023:59:59&iDisplayLength=2000",
    { headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" } }
  );

  return fixSMS(res.data);
}

/* ================= AUTO REFRESH LOGIN ================= */
setInterval(() => login(), 10 * 60 * 1000);

/* ================= API ROUTE ================= */
router.get("/", async (req, res) => {
  const { type } = req.query;
  if (!type) return res.json({ error: "Use ?type=numbers OR ?type=sms" });

  try {
    if (!cookie) await login();

    if (type === "numbers") return res.json(await getNumbers());
    if (type === "sms") return res.json(await getSMS());

    res.json({ error: "Invalid type" });
  } catch (e) {
    cookie = "";
    res.json({ error: "Session expired — retrying next request" });
  }
});

module.exports = router;
