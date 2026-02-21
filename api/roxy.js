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
    const range = clean(row[0] || row[1] || "Unknown Provider");
    const number = row[2] || row[3] || "";
    const weekly = "Weekly";
    const price = clean(row[4] || "$ 0.01");
    const sdSw = clean(row[5] || row[7] || "SD : 0 | SW : 0");

    return [
      range,   // Column 1: Range / Provider
      "",      // Column 2: blank
      number,  // Column 3: Number
      weekly,  // Column 4: Weekly
      price,   // Column 5: Price
      sdSw     // Column 6: SD/SW
    ];
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

  const data = res.data;
  return fixNumbers(data);
}

/* ================= FETCH SMS ================= */
async function getSMS() {
  if (!cookie) await login();

  const res = await client.get(
    "/agent/res/data_smscdr.php?fdate1=2020-01-01%2000:00:00&fdate2=2099-12-31%2023:59:59&iDisplayLength=2000",
    { headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" } }
  );

  const data = res.data;

  // Move SMS/OTP to column 4 if missing
  data.aaData = data.aaData.map(r => {
    if ((!r[4] || r[4].trim() === "") && r[5]) {
      r[4] = r[5];
      r.splice(5, 1);
    }
    // Remove unwanted text
    r[4] = (r[4] || "").replace(/legendhacker/gi, "").trim();
    r[5] = r[5] || "";
    r[6] = r[6] || "$";
    r[7] = r[7] || 0;
    return r.slice(0, 8);
  });

  return data;
}

/* ================= AUTO REFRESH ================= */
setInterval(login, 10 * 60 * 1000); // every 10 minutes

/* ================= API ROUTE ================= */
router.get("/", async (req, res) => {
  const type = req.query.type;
  if (!type) return res.json({ error: "Use ?type=numbers OR ?type=sms" });

  try {
    if (!cookie) await login();

    let result;
    if (type === "numbers") result = await getNumbers();
    else if (type === "sms") result = await getSMS();
    else return res.json({ error: "Invalid type" });

    res.json(result);
  } catch (e) {
    cookie = "";
    res.json({ error: "Session expired — retrying next request" });
  }
});

module.exports = router;
