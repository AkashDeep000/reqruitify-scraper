import dotenv from "dotenv";
dotenv.config();

const username = process.env["USER_NAME"];
const password = process.env["PASSWORD"];

export default async function login() {
  const res = await fetch(
    "https://my.recruitifi.com/api/v3/authentication/login",
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8,bn;q=0.7",
        authentication: "undefined",
        "content-type": "application/json",
        "sec-ch-ua":
          '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
      referrer: "https://my.recruitifi.com/app/login",
      referrerPolicy: "same-origin",
      body: `{"email":"${username}","password":"${password}"}`,
      method: "POST",
      mode: "cors",
      credentials: "include",
    },
  );
  const data = await res.json();
  return data.data.attributes.token;
}
