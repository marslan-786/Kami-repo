const express = require("express");
const axios = require("axios");

const router = express.Router();

/* ================= CONFIG ================= */

const BASE = "http://167.114.209.78/roxy";
const USER = "Kamibroken";
const PASS = "Kamran5.";

let cookie = "";

/* ================= AXIOS ================= */

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
    cookie +=
      "; " +
      res.headers["set-cookie"].map(c => c.split(";")[0]).join("; ");
  }
}

/* ================= CLEAN HTML ================= */

const clean = txt =>
  (txt || "").replace(/<[^>]+>/g, "").trim();

/* ================= NUMBERS ================= */

async function getNumbers() {
  if (!cookie) await login();

  const res = await client.get(
    "/agent/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iDisplayStart=0&iDisplayLength=-1",
    {
      headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" },
    }
  );

  const data = res.data;

  data.aaData = data.aaData.map(r => [
    clean(r[1]),      // Range Name
    "",               // blank column
    clean(r[3]),      // ✅ NUMBER (MAIN FIX)
    "Weekly",
    clean(r[4]),      // Price
    clean(r[6]),      // Stats
  ]);

  return data;
}

/* ================= SMS ================= */

async function getSMS() {
  if (!cookie) await login();

  const res = await client.get(
    "/agent/res/data_smscdr.php?fdate1=2020-01-01%2000:00:00&fdate2=2099-12-31%2023:59:59&iDisplayLength=2000",
    {
      headers: { Cookie: cookie, "X-Requested-With": "XMLHttpRequest" },
    }
  );

  const data = res.data;

  data.aaData = data.aaData.map(r => {
    if ((!r[4] || r[4] === "") && r[5]) {
      r[4] = r[5];
    }

    return [
      clean(r[1]),  // number
      clean(r[4]),  // sms
      clean(r[6]),  // date
    ];
  });

  return data;
}

/* ================= AUTO LOGIN ================= */

setInterval(login, 10 * 60 * 1000);

/* ================= ROUTE ================= */

router.get("/", async (req, res) => {
  const type = req.query.type;

  try {
    if (!cookie) await login();

    if (type === "numbers") return res.json(await getNumbers());
    if (type === "sms") return res.json(await getSMS());

    res.json({
      usage: "/api/roxy?type=numbers OR /api/roxy?type=sms",
    });
  } catch (e) {
    cookie = "";
    res.json({ error: "Session expired" });
  }
});

module.exports = router;
