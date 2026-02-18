const express = require("express");
const axios = require("axios");
const qs = require("querystring");

const app = express();

const BASE = "http://51.89.99.105/NumberPanel";

const PANEL = {
  username: "Kami555",
  password: "Kami526"
};

let cookies = "";
let sesskey = "";

// ================= LOGIN =================
async function login() {
  try {
    const res = await axios.get(BASE + "/login");

    cookies = res.headers["set-cookie"].join(";");

    const match = res.data.match(/What is (\d+) \+ (\d+)/);
    let ans = "10";
    if (match) ans = Number(match[1]) + Number(match[2]);

    await axios.post(
      BASE + "/signin",
      qs.stringify({
        username: PANEL.username,
        password: PANEL.password,
        capt: ans
      }),
      {
        headers: {
          Cookie: cookies,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const stats = await axios.get(BASE + "/client/SMSCDRStats", {
      headers: { Cookie: cookies }
    });

    const key = stats.data.match(/sesskey=([^&"]+)/);
    if (key) sesskey = key[1];

    console.log("✅ Login OK");
  } catch (e) {
    console.log("Login Error:", e.message);
  }
}

// ================= FETCH SMS =================
async function fetchSMS() {
  try {
    if (!sesskey) await login();

    const today = new Date().toISOString().split("T")[0];

    const url =
      `${BASE}/client/res/data_smscdr.php?` +
      `fdate1=${today}%2000:00:00&fdate2=${today}%2023:59:59` +
      `&sesskey=${sesskey}&iDisplayLength=50&_=${Date.now()}`;

    const res = await axios.get(url, {
      headers: {
        Cookie: cookies,
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (!res.data.aaData) return [];

    return res.data.aaData.map(r => ({
      time: r[0],
      number: r[2],
      service: r[3],
      message: r[4]
    }));
  } catch (e) {
    sesskey = "";
    return [];
  }
}

// ================= FETCH NUMBERS =================
async function fetchNumbers() {
  try {
    if (!sesskey) await login();

    const ts = Date.now();

    const url =
      `${BASE}/client/res/data_smsnumbers.php?frange=&fclient=&sEcho=2&iColumns=6&sColumns=%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=-1&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&sSearch=&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=${ts}`;

    const res = await axios.get(url, {
      headers: {
        Cookie: cookies,
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (!res.data.aaData) return [];

    return res.data.aaData.map(r => ({
      id: r[0],
      number: r[1],
      country: r[2],
      service: r[3],
      status: r[4]
    }));
  } catch (e) {
    sesskey = "";
    return [];
  }
}

// ================= API ROUTES =================
app.get("/api/sms", async (req, res) => {
  const data = await fetchSMS();
  res.json({ status: true, total: data.length, data });
});

app.get("/api/numbers", async (req, res) => {
  const data = await fetchNumbers();
  res.json({ status: true, total: data.length, data });
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("🚀 Running on port", PORT);
  await login();
});
