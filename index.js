import login from "./utils/login.js";
import { AsyncParser } from "@json2csv/node";
import date from "date-and-time";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { log } from "console";
import pLimit from "p-limit";

dotenv.config();

const token = await login();
log("logedIn");
const reqArgs = {
  headers: {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8,bn;q=0.7",
    authentication: "Bearer " + token,
    "sec-ch-ua":
      '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Linux"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
  },
  referrer: "https://my.recruitifi.com/app/my-jobcasts/active",
  referrerPolicy: "same-origin",
  body: null,
  method: "GET",
  mode: "cors",
  credentials: "include",
};

const jobsRes = await fetch(
  "https://my.recruitifi.com/api/v3/recruiter/requests?status=unarchived",
  { ...reqArgs },
);

const jobsUnfiltered = (await jobsRes.json()).data;
const jobs = jobsUnfiltered.filter(
  (item) =>
    item?.attributes?.submitted_to == false &&
    item?.attributes?.status == "active" &&
    !item?.attributes?.deactivated,
);
log({ totalJobCount: jobs.length });

const limit = pLimit(10);

const getJobsDetailsPromise = jobs.map((job) =>
  limit(async () => {
    const jobRes = await fetch(
      "https://my.recruitifi.com/api/v3/recruiter/requests/" + job.id,
      { ...reqArgs },
    );
    const jobDetails = (await jobRes.json()).included[0].attributes;
    // log({
    //   activeRequest: limit.activeCount,
    //   pendingRequest: limit.pendingCount,
    // });
    return jobDetails;
  }),
);

const jobsDetails = await Promise.all(getJobsDetailsPromise);

let maxLocationCount = 0;
jobsDetails.forEach((job) => {
  if (maxLocationCount < job.locations.length)
    maxLocationCount = job.locations.length;
});
log({ maxLocationCount });

function getLocationsObj(locations) {
  const obj = {};
  for (let i = 0; i < maxLocationCount; i++) {
    if (!locations[i]) obj["LOCATION " + i] = "N/A";
    const arr = [];
    arr.push(locations[i]?.city);
    arr.push(locations[i]?.state);
    arr.push(locations[i]?.country);
    arr.push(locations[i]?.postal_code);

    obj["LOCATION " + i] = arr.filter((item) => item?.length > 0).join(`, `);
  }
  return obj;
}

function getCommaSeperated(arr) {
  if (Array.isArray(arr)) {
    return arr.join(", ");
  }
  try {
    return JSON.parse(arr).join(", ");
  } catch (e) {
    return arr;
  }
}

console.log({ allTimeTotal: jobsDetails.length });

const endDate = new Date(new Date().toDateString());
const startDate = date.addDays(endDate, -7);

console.log({
  startDate,
  endDate,
  totalDayCount: date.subtract(endDate, startDate).toDays(),
});

const filteredData = jobsDetails.filter((job) =>
  process.env.GET_ALL
    ? true
    : date.subtract(startDate, new Date(job.created_at)).toMilliseconds() <= 0,
);

const dateSet = new Set(
  filteredData.map((job) => job.created_at.split("T")[0]),
);
console.log(dateSet);

const JobsDetailsFormated = filteredData.map((job) => {
  const locations = getLocationsObj(job.locations);
  return {
    "CREATED AT": job.created_at.split("T")[0],
    "ORGANIZATION NAME": job.organization_name,
    TITLE: job.title,
    "JOBCAST ID": job.jobcast_identifier,
    LEVEL: job.level,
    "REPORTS TO": job.reports_to || " ",
    "VACANT SINCE": job.vacant_since,
    VACANCIES: job.position_count,
    "TRAVEL REQUIRED": job.travel_required,
    "VISA SUPPORT": job.visa_support,
    "OFCCP/EEOC": job.ofccp ? "Yes" : "No",
    "REPORTS TO": job.reports_to,
    ...locations,
    CURRENCY: job.currency_code,
    "SALARY MIN": job.salary_min_cents / 100,
    "SALARY MAX": job.salary_max_cents / 100,
    "SIGNING BONUS": job.signing_bonus_type,
    "BONUS DESCRIPTION": job.bonus_description,
    "RELOCATION PACKAGE": job.relocation_package,
    "Must-Haves": getCommaSeperated(job.must_haves),
    "Nice-To-Haves": getCommaSeperated(job.nice_to_haves),
    "Job Description": job.html_description,
    "Screening Questions": job.screening_questions.join(`, `),
    "Interview Steps": getCommaSeperated(job.interview_steps),
    Benefits: getCommaSeperated(job.benefits),
  };
});

log("Last 7 day - " + JobsDetailsFormated.length + " new job");

const opts = {};
const transformOpts = {};
const asyncOpts = {};
const parser = new AsyncParser(opts, asyncOpts, transformOpts);

const csv = await parser.parse(JobsDetailsFormated).promise();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env["GMAIL_ID"],
    pass: process.env["GMAIL_PASS"],
  },
});

const info = await transporter.sendMail({
  from: `Recrutifi Scraper BOT <${process.env["GMAIL_ID"]}>`, // sender address
  to: process.env["RECIVER_EMAIL"], // list of receivers
  subject: `[${startDate.toISOString().split("T")[0]}-TO-${
    endDate.toISOString().split("T")[0]
  }] ${filteredData.length} New Job - Recruitify Scraper Bot`, // Subject line
  attachments: [
    {
      filename: `${startDate.toISOString().split("T")[0]}_${
        endDate.toISOString().split("T")[0]
      }.csv`,
      content: csv,
    },
  ],
});

log("Message sent: %s", info.messageId);
