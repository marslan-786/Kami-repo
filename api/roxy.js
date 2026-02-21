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
    "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/144 Mobile",
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
  return text.replace(/<[^>]+>/g, "").replace(/\n|\r/g, "").trim();
}

/* ================= FIX NUMBERS ================= */
function fixNumbers(data) {
  if (!data.aaData) return data;

  data.aaData = data.aaData.map(row => {
    const number = row[2] || row[3] || "";
    const range = row[0] || row[1] || "";
    const price = clean(row[4]) || "$ 0.01";
    const sd = clean(row[5] || row[7]) || "SD : 0 | SW : 0";

    return [
      range,     // Column 1: Range / Provider
      "",        // Column 2: blank
      number,    // Column 3: Number
      "Weekly",  // Column 4
      price,     // Column 5: Price
      sd         // Column 6: SD/SW
    ];
  });

  return data;
}

/* ================= FIX SMS ================= */
function fixSMS(data) {
  if (!data.aaData) return data;

  data.aaData = data.aaData.map(row => {
    if ((!row[4] || row[4].trim() === "") && row[5]) {
      row[4] = row[5];
    }

    // Remove unwanted text
    row[4] = (row[4] || "").replace(/legendhacker/gi, "").trim();

    // Fill missing columns
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
setInterval(login, 10 * 60 * 1000);

/* ================= API ROUTE ================= */
router.get("/", async (req, res) => {
  const type = req.query.type;

  try {
    if (!cookie) await login();

    if (type === "numbers") return res.json(await getNumbers());
    if (type === "sms") return res.json(await getSMS());

    res.json({ error: "Use ?type=numbers OR ?type=sms" });
  } catch (e) {
    cookie = "";
    res.json({ error: "Session expired — retrying next request" });
  }
});

module.exports = router;
