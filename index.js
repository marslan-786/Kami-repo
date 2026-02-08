// ================= COMPLETE & FIXED SERVER =================

const express = require('express');
const got = require('got');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const { parsePhoneNumber } = require('libphonenumber-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------- CLIENT ----------------
const cookieJar = new CookieJar();
const client = got.extend({
    cookieJar,
    headers: {
        'User-Agent':
            'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'
    },
    retry: { limit: 2 },
    timeout: { request: 15000 }
});

// ---------------- CONFIG ----------------
const TARGET_HOST = 'http://139.99.63.204';
const LOGIN_URL = `${TARGET_HOST}/ints/login`;
const SIGNIN_URL = `${TARGET_HOST}/ints/signin`;
const DATA_URL = `${TARGET_HOST}/ints/agent/res/data_smsnumbers.php`;

const SMS_API_URL =
    'http://51.77.216.195/crapi/dgroup/viewstats?token=Q1JQRzRSQopDbYh8U3iRWItnlGtpVVJehnJYQVaBmYJYU4tqaX-J==&records=100';

const USERNAME = process.env.PANEL_USER || 'teamlegend097';
const PASSWORD = process.env.PANEL_PASS || 'teamlegend097';

// ---------------- CACHE ----------------
let numbersCache = null;
let numbersLastFetch = 0;
const NUMBERS_CACHE_TIME = 5 * 60 * 1000;

let smsCache = null;
let smsLastFetch = 0;
const SMS_CACHE_TIME = 5000;

// ---------------- HELPERS ----------------
function getCountryFromNumber(number) {
    try {
        if (!number) return 'International';
        const str = number.toString().startsWith('+')
            ? number.toString()
            : '+' + number;
        const phone = parsePhoneNumber(str);
        if (phone && phone.country) {
            const dn = new Intl.DisplayNames(['en'], { type: 'region' });
            return dn.of(phone.country);
        }
        return 'International';
    } catch {
        return 'International';
    }
}

function fixSmsMessage(msg) {
    if (!msg) return '';
    return msg.replace(/(\d)n/g, '$1 ').replace(/\n/g, ' ');
}

async function ensureLoggedIn() {
    const loginPage = await client.get(LOGIN_URL);
    const $ = cheerio.load(loginPage.body);
    const labelText = $('label:contains("What is")').text();
    const match = labelText.match(/(\d+)\s*\+\s*(\d+)/);
    const capt = match ? parseInt(match[1]) + parseInt(match[2]) : 0;

    await client.post(SIGNIN_URL, {
        form: {
            username: USERNAME,
            password: PASSWORD,
            capt
        },
        headers: { Referer: LOGIN_URL }
    });
}

// ---------------- ROUTES ----------------
app.get('/', (req, res) => {
    res.send('Proxy Running');
});

// ================= NUMBERS API =================
app.get('/api/numbers', async (req, res) => {
    try {
        const now = Date.now();

        if (numbersCache && now - numbersLastFetch < NUMBERS_CACHE_TIME) {
            return res.json(numbersCache);
        }

        await ensureLoggedIn();

        const params = new URLSearchParams({
            frange: '',
            fclient: '',
            sEcho: 2,
            iColumns: 8,
            sColumns: ',,,,,,,',
            iDisplayStart: 0,
            iDisplayLength: -1,
            sSearch: '',
            bRegex: false,
            iSortCol_0: 0,
            sSortDir_0: 'asc',
            iSortingCols: 1,
            _: Date.now()
        });

        const response = await client.get(
            `${DATA_URL}?${params.toString()}`,
            {
                headers: {
                    Referer: `${TARGET_HOST}/ints/agent/SMSNumberStats`,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            }
        );

        let rawData;
        try {
            rawData = JSON.parse(response.body);
        } catch {
            if (numbersCache) return res.json(numbersCache);
            return res.status(500).json({ error: 'Invalid JSON' });
        }

        if (!rawData || !Array.isArray(rawData.aaData)) {
            if (numbersCache) return res.json(numbersCache);
            return res.status(500).json({ error: 'Bad data' });
        }

        rawData.aaData = rawData.aaData.map(item => {
            const number = item[0];
            const country = getCountryFromNumber(number);
            const currency = item[2] || '$';
            const price = item[3] || '0';

            return [
                country,
                '',
                number,
                'OTP',
                `${currency} ${price}`,
                'SD : <b>0</b> | SW : <b>0</b>'
            ];
        });

        numbersCache = rawData;
        numbersLastFetch = now;
        res.json(numbersCache);

    } catch (err) {
        if (numbersCache) return res.json(numbersCache);
        res.status(500).json({ error: 'Failed' });
    }
});

// ================= SMS API =================
app.get('/api/sms', async (req, res) => {
    try {
        const now = Date.now();

        if (smsCache && now - smsLastFetch < SMS_CACHE_TIME) {
            return res.json(smsCache);
        }

        const response = await got.get(SMS_API_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
                Accept: '*/*'
            }
        });

        let rawData;
        try {
            rawData = JSON.parse(response.body);
        } catch {
            if (smsCache) return res.json(smsCache);
            return res.json({
                sEcho: 1,
                iTotalRecords: 0,
                iTotalDisplayRecords: 0,
                aaData: []
            });
        }

        if (!Array.isArray(rawData) || rawData.length === 0) {
            if (smsCache) return res.json(smsCache);
            return res.json({
                sEcho: 1,
                iTotalRecords: 0,
                iTotalDisplayRecords: 0,
                aaData: []
            });
        }

        const formattedData = rawData.map(item => [
            item[3] || '',
            getCountryFromNumber(item[1]),
            item[1] || '',
            item[0] || '',
            fixSmsMessage(item[2] || ''),
            '$',
            '0.005',
            ''
        ]);

        formattedData.push([
            '0,0.05,0,0,0,0,0,0.05,0,0,100%,0,9',
            0, 0, 0, '', '$', 0, 0
        ]);

        smsCache = {
            sEcho: 1,
            iTotalRecords: formattedData.length.toString(),
            iTotalDisplayRecords: formattedData.length.toString(),
            aaData: formattedData
        };

        smsLastFetch = now;
        res.json(smsCache);

    } catch (err) {
        if (smsCache) return res.json(smsCache);
        res.json({
            sEcho: 1,
            iTotalRecords: 0,
            iTotalDisplayRecords: 0,
            aaData: []
        });
    }
});

// ---------------- START ----------------
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
