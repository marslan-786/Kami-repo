const express = require("express");
const axios = require("axios");
const router = express.Router();

// ================= CONFIG =================
const BASE = "http://167.114.209.78/roxy";
const USER = "Kamibroken";
const PASS = "Kamran5.";

let cookie = "";

// ================= AXIOS CLIENT =================
const client = axios.create({
  baseURL: BASE,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/144 Mobile",
  },
  validateStatus: () => true,
});

// ================= COUNTRY DETECTION =================
const countries = {
  "20": "Egypt",
  "221": "Senegal",
  "232": "Sierra Leone",
  "60": "Malaysia",
  // add more country codes as needed
};

function detectCountry(number) {
  if (!number) return "Unknown";
  for (let code in countries) {
    if (number.startsWith(code)) return countries[code];
  }
  return "Unknown";
}

// ================= LOGIN =================
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
    cookie +=
      "; " + res.headers["set-cookie"].map((c) => c.split(";")[0]).join("; ");
  }
}

// ================= FIX NUMBERS =================
function fixNumbers(data) {
  if (!data.aaData) return data;

  data.aaData = data.aaData.map((row) => {
    const number = row[3] || "";
    const countryName = detectCountry(number);
    const rangeName = `${countryName} ${row[0] || ""}`.trim();

    return [
      rangeName, // Column 1: Country + Range
      "", // Column 2: blank
      number, // Column 3: Number
      "Weekly", // Column 4
      (row[4] || "$ 0.01").replace(/<[^>]+>/g, "").trim(), // Column 5: price
      (row[5] || row[7] || "SD : 0 | SW : 0").replace(/<[^>]+>/g, "").trim(), // Column 6
    ];
  });

  return data;
}

// ================= FIX SMS =================
function fixSMS(data) {
  if (!data.aaData) return data;

  data.aaData = data.aaData.map((row) => {
    if ((!row[4] || row[4].trim() === "") && row[5]) {
      row[4] = row[5];
    }

    row[4] = (row[4] || "").replace(/legendhacker/gi, "").trim();
    row[5] = row[5] || "";
    row[6] = row[6] || "$";
    row[7] = row[7] || 0;

    return row.slice(0, 8); // keep first 8 columns
  });

  return data;
}

// ================= FETCH NUMBERS =================
async function getNumbers() {
  if (!cookie) await login();
  const res = await client.get(
    "/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1",
    { headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" } }
  );
  return fixNumbers(res.data);
}

// ================= FETCH SMS =================
async function getSMS() {
  if (!cookie) await login();

  const today = new Date();
  const fdate1 = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(today.getDate()).padStart(2, "0")} 00:00:00`;
  const fdate2 = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(today.getDate()).padStart(2, "0")} 23:59:59`;

  const res = await client.get(
    `/agent/res/data_smscdr.php?fdate1=${encodeURIComponent(
      fdate1
    )}&fdate2=${encodeURIComponent(fdate2)}&iDisplayLength=5000`,
    { headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" } }
  );

  return fixSMS(res.data);
}

// ================= AUTO REFRESH LOGIN =================
setInterval(() => login(), 10 * 60 * 1000); // every 10 minutes

// ================= API ROUTE =================
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
