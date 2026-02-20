const express = require("express");
const axios = require("axios");
const tough = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

const app = express();
const PORT = process.env.PORT || 5000;

const BASE = "http://145.239.130.45/ints";

const jar = new tough.CookieJar();

const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 20000,
    headers: {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest"
    }
}));

let loggedIn = false;

async function login() {
    if (loggedIn) return;

    console.log("🔄 Logging in MSI...");

    await client.post(`${BASE}/signin`,
        "username=Kami526&password=Kamran52&capt=3",
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    // SESSION ACTIVATE (VERY IMPORTANT)
    await client.get(`${BASE}/agent/`);
    await client.get(`${BASE}/agent/SMSDashboard`);

    loggedIn = true;
    console.log("✅ MSI Login success");
}

async function fetchNumbers() {
    const url = `${BASE}/agent/res/data_smsnumbers.php?sEcho=1&iColumns=8&iDisplayStart=0&iDisplayLength=-1`;
    const res = await client.get(url, {
        headers: { Referer: `${BASE}/agent/MySMSNumbers` }
    });
    return res.data;
}

async function fetchSMS() {
    const url = `${BASE}/agent/res/data_smscdr.php?fdate1=2020-01-01%2000:00:00&fdate2=2099-12-31%2023:59:59&sEcho=1&iColumns=9&iDisplayStart=0&iDisplayLength=100&iSortCol_0=0&sSortDir_0=desc`;
    const res = await client.get(url, {
        headers: { Referer: `${BASE}/agent/SMSCDRReports` }
    });
    return res.data;
}

app.get("/api", async (req, res) => {
    const { type } = req.query;

    if (!type) return res.json({ error: "Use ?type=numbers or ?type=sms" });

    try {
        await login();

        let data;

        if (type === "numbers") {
            data = await fetchNumbers();
        } else if (type === "sms") {
            data = await fetchSMS();
        } else {
            return res.json({ error: "Invalid type" });
        }

        res.json(data);

    } catch (err) {
        loggedIn = false;
        res.json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log("🚀 Server running");
});
