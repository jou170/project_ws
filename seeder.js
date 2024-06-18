const { faker } = require("@faker-js/faker");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const axios = require("axios");
const moment = require("moment");

faker.seed(42);

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { family: 4 });
const dbName = "coba";

let usedEmployees = [];
let usedCompany = [];
let topup_id = 0;
let transaction_id = 0;

async function createEmployeeData() {
  const sex = faker.person.sexType();
  const firstName = faker.person.firstName(sex);
  const lastName = faker.person.lastName(sex);
  const name = `${firstName} ${lastName}`;
  const email = `${firstName.toLowerCase()}@gmail.com`;
  const username = `${firstName.toLowerCase()}`;
  const phone_number = faker.helpers.fromRegExp(/0[38]{1}1[0-9]{9}/);
  const address = faker.location.streetAddress({ useFullAddress: true });
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash("12345678", salt);

  return {
    _id: new ObjectId(),
    username: username,
    email: email,
    name: name,
    password: hashedPassword,
    role: "employee",
    phone_number: phone_number,
    address: address,
    profile_picture: "/uploads/default.jpg",
    company: "",
  };
}

async function createAdminData() {
  const sex = faker.person.sexType();
  const firstName = faker.person.firstName(sex);
  const lastName = faker.person.lastName(sex);
  const name = `${firstName} ${lastName}`;
  const email = `${firstName.toLowerCase()}@gmail.com`;
  const username = `${firstName.toLowerCase()}`;
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash("12345678", salt);

  return {
    _id: new ObjectId(),
    username: username,
    email: email,
    name: name,
    password: hashedPassword,
    role: "admin",
  };
}

async function createCompaniesData() {
  const name = faker.company.name();
  const splitName = name.split(/[\s\W]+/);
  const email = `${splitName[0].toLowerCase()}@gmail.com`;
  const username = `${splitName[0].toLowerCase()}`;
  const phone_number = faker.helpers.fromRegExp(/0[38]{1}1[0-9]{9}/);
  const address = faker.location.streetAddress({ useFullAddress: true });
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash("12345678", salt);
  const database = client.db(dbName);
  const collection = database.collection("users");
  const invitationCode = await generateInvitationCode(collection);

  return {
    _id: new ObjectId(),
    username: username,
    email: email,
    name: name,
    password: hashedPassword,
    role: "company",
    phone_number: phone_number,
    address: address,
    profile_picture: "/uploads/default.jpg",
    balance: 0,
    plan_type: "free",
    invitation_code: invitationCode,
    invitation_limit: 10,
    employees: [],
  };
}

async function createCompaniesWithEmployeeData(client) {
  const name = faker.company.name();
  const splitName = name.split(/[\s\W]+/);
  const email = `${splitName[0].toLowerCase()}@gmail.com`;
  const username = `${splitName[0].toLowerCase()}`;
  const phone_number = faker.helpers.fromRegExp(/0[38]{1}1[0-9]{9}/);
  const address = faker.location.streetAddress({ useFullAddress: true });
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash("12345678", salt);

  const database = client.db(dbName);
  const collection = database.collection("users");

  let isUnique = false;
  let employee;

  while (!isUnique) {
    const totalEmployees = await collection.countDocuments({
      role: "employee",
      company: "",
    });

    const randomIndex = Math.floor(Math.random() * totalEmployees);

    employee = await collection
      .aggregate([
        { $match: { role: "employee", company: "" } },
        { $skip: randomIndex },
        { $limit: 1 },
      ])
      .next();

    if (employee && !usedEmployees.includes(employee.username)) {
      isUnique = true;
    }
  }
  const invitationCode = await generateInvitationCode(collection);

  const companyData = {
    _id: new ObjectId(),
    username: username,
    email: email,
    name: name,
    password: hashedPassword,
    role: "company",
    phone_number: phone_number,
    address: address,
    profile_picture: "/uploads/default.jpg",
    balance: 0,
    plan_type: "free",
    invitation_code: invitationCode,
    invitation_limit: 9,
    employees: [employee.username],
  };

  await collection.insertOne(companyData);
  await collection.updateOne(
    { username: employee.username },
    { $set: { company: username } }
  );

  usedEmployees.push(employee.username);
  return companyData;
}

async function createTopUp(client) {
  const database = client.db(dbName);
  const collection = database.collection("users");

  const companies = await collection.find({ role: "company" }).toArray();
  const availableCompanies = companies.filter(
    (company) => !usedCompany.includes(company.username)
  );

  let unique = false;
  let company;
  while (!unique && availableCompanies.length > 0) {
    let randomIndex = Math.floor(Math.random() * availableCompanies.length);
    company = availableCompanies[randomIndex];

    if (!usedCompany.includes(company.username)) {
      unique = true;
      usedCompany.push(company.username);
    }
  }

  let random = Math.floor(Math.random() * 4) + 1;
  let randomAmount = Math.floor(Math.random() * (100 - 50 + 1)) + 50;
  let currentDate = new Date();
  let datetime = `${currentDate.getFullYear()}-${padNumber(
    currentDate.getMonth() + 1
  )}-${padNumber(currentDate.getDate())} ${padNumber(
    currentDate.getHours()
  )}:${padNumber(currentDate.getMinutes())}`;
  topup_id++;
  let topup;

  if (random === 1) {
    topup = {
      _id: new ObjectId(),
      topup_id: topup_id,
      username: company.username,
      amount: randomAmount.toString(),
      status: "pending",
      datetime: datetime,
    };
    await database.collection("topups").insertOne(topup);
  } else if (random === 2 || random == 3) {
    topup = {
      _id: new ObjectId(),
      topup_id: topup_id,
      username: company.username,
      amount: randomAmount.toString(),
      status: "approved",
      datetime: datetime,
    };
    await database.collection("topups").insertOne(topup);
    let oldBalance = parseFloat(company.balance);
    let balanceToAdd = parseFloat(randomAmount);
    let newBalance = oldBalance + balanceToAdd;
    newBalance = parseFloat(newBalance.toFixed(2));
    await database
      .collection("users")
      .updateOne(
        { username: company.username },
        { $set: { balance: newBalance } }
      );

    let randomNum = Math.floor(Math.random() * 3) + 1;
    if (randomNum == 1 || randomNum == 3) {
      newBalance = newBalance - 30;
      await database
        .collection("users")
        .updateOne(
          { username: company.username },
          { $set: { balance: newBalance, plan_type: "standard" } }
        );
      transaction_id++;
      await database.collection("transactions").insertOne({
        transaction_id: transaction_id,
        username: company.username,
        type: `Upgrade plan type from free to standard`,
        date: datetime,
        charge: 30,
      });
    }
  } else if (random === 4) {
    topup = {
      _id: new ObjectId(),
      topup_id: topup_id,
      username: company.username,
      amount: randomAmount.toString(),
      status: "rejected",
      datetime: datetime,
    };
    await database.collection("topups").insertOne(topup);
  }

  return topup;
}

function padNumber(number) {
  return number.toString().padStart(2, "0");
}

const generateInvitationCode = async (collection) => {
  let isUnique = false;
  let invitationCode;

  while (!isUnique) {
    const buffer = crypto.randomBytes(6);

    invitationCode = buffer.toString("hex").toUpperCase();

    const existingCompany = await collection.findOne({
      invitation_code: invitationCode,
    });
    if (!existingCompany) {
      isUnique = true;
    }
  }

  return invitationCode;
};

function createEmployeeDatas(n) {
  const users = [];
  for (let i = 0; i < n; i++) {
    users.push(createEmployeeData());
  }
  return users;
}

function createAdminDatas(n) {
  const users = [];
  for (let i = 0; i < n; i++) {
    users.push(createAdminData());
  }
  return users;
}

function createCompaniesDatas(n) {
  const users = [];
  for (let i = 0; i < n; i++) {
    users.push(createCompaniesData());
  }
  return users;
}

function createCompaniesWithEmployeeDatas(n, client) {
  const users = [];
  for (let i = 0; i < n; i++) {
    users.push(createCompaniesWithEmployeeData(client));
  }
  return users;
}

function createTopUpDatas(n, client) {
  const topups = [];
  for (let i = 0; i < n; i++) {
    topups.push(createTopUp(client));
  }
  return topups;
}

async function createSchedulesForCompany(
  client,
  username,
  start_date,
  end_date
) {
  await client.connect();
  const database = client.db(dbName);
  const collection = database.collection("schedules");

  const response = await axios.get("https://dayoffapi.vercel.app/api", {
    params: { year: moment(start_date).year() },
  });
  const holidays = response.data;

  const holidayDates = holidays.map((holiday) => ({
    date: moment(holiday.tanggal, "YYYY-M-D").format("YYYY-MM-DD"),
    detail: holiday.keterangan,
    is_cuti: holiday.is_cuti,
  }));

  const startDate = moment(start_date);
  const endDate = moment(end_date);
  let activeDays = 0;
  let offDays = [];
  let existingDays = [];

  const existingSchedules = await collection
    .find({
      username,
      date: { $gte: start_date, $lte: end_date },
    })
    .toArray();

  const existingDates = existingSchedules.map((schedule) => schedule.date);

  for (
    let date = startDate.clone();
    date.isSameOrBefore(endDate);
    date.add(1, "days")
  ) {
    const day = date.format("dddd");
    const dateString = date.format("YYYY-MM-DD");

    const isWeekend = day === "Saturday" || day === "Sunday";
    const holiday = holidayDates.find((h) => h.date === dateString);
    const isAlreadyScheduled = existingDates.includes(dateString);

    if (!isWeekend && !holiday && !isAlreadyScheduled) {
      activeDays++;
    } else {
      if (isWeekend || holiday) {
        offDays.push({
          day,
          date: dateString,
          detail: holiday ? holiday.detail : "",
        });
      }
      if (isAlreadyScheduled) {
        existingDays.push(dateString);
      }
    }
  }

  if (activeDays > 0) {
    let charge = activeDays * 0.1;

    const companyCollection = database.collection("users");
    const company = await companyCollection.findOne({ username });

    if (company.balance >= charge) {
      let oldBalance = parseFloat(company.balance);
      let newBalance = oldBalance - charge;
      newBalance = parseFloat(newBalance.toFixed(2));

      await companyCollection.updateOne(
        { username },
        { $set: { balance: newBalance } }
      );

      let success_date = [];

      const today = new Date();
      console.log(company.employees);
      for (
        let date = startDate.clone();
        date.isSameOrBefore(endDate);
        date.add(1, "days")
      ) {
        const day = date.format("dddd");
        const dateString = date.format("YYYY-MM-DD");

        const isFuture = date.isAfter(today, "day");
        const isWeekend = day === "Saturday" || day === "Sunday";
        const holiday = holidayDates.find((h) => h.date === dateString);
        const isAlreadyScheduled = existingDates.includes(dateString);

        if (!isWeekend && !holiday && !isAlreadyScheduled) {
          const attendance = [];

          if (!isFuture) {
            const numEmployees = Math.floor(
              Math.random() * (company.employees.length + 1)
            );
            const shuffledEmployees = company.employees.sort(
              () => 0.5 - Math.random()
            );
            attendance.push(...shuffledEmployees.slice(0, numEmployees));
          }

          await collection.insertOne({
            username,
            date: dateString,
            day,
            attendance,
          });

          success_date.push(dateString);
        }
      }

      const transCollection = database.collection("transactions");
      charge = parseFloat(charge.toFixed(2));
      transaction_id++;
      await transCollection.insertOne({
        transaction_id: transaction_id,
        username: username,
        type: `Create schedules`,
        datetime: kurangiSatuHari(startDate),
        charge: charge,
        detail: `Schedules created from ${start_date} to ${end_date} with ${activeDays} active days`,
        schedule_dates: success_date,
      });
    }
  }
}

async function deleteSchedulesForCompany(
  client,
  username,
  start_date,
  end_date
) {
  await client.connect();
  const database = client.db(dbName);
  const collection = database.collection("schedules");
  const companyCollection = database.collection("users");
  const company = await companyCollection.findOne({ username });

  const existingSchedules = await collection
    .find({
      username,
      date: { $gte: start_date, $lte: end_date },
    })
    .toArray();

  if (existingSchedules.length > 0) {
    let charge = existingSchedules.length * 0.1;
    charge = parseFloat(charge.toFixed(2));

    if (company.balance >= charge) {
      const deletedSchedules = existingSchedules.map(
        (schedule) => schedule.date
      );
      await collection.deleteMany({
        username,
        date: { $gte: start_date, $lte: end_date },
      });

      let newBalance = parseFloat(company.balance) - charge;
      newBalance = parseFloat(newBalance.toFixed(2));

      await companyCollection.updateOne(
        { username },
        { $set: { balance: newBalance } }
      );

      const transCollection = database.collection("transactions");
      transaction_id++;
      await transCollection.insertOne({
        transaction_id: transaction_id,
        username: username,
        type: `Delete schedules`,
        datetime: kurangiSatuHari(start_date),
        charge: charge,
        detail: `Schedules deleted from ${start_date} to ${end_date} with ${deletedSchedules.length} schedules affected`,
        schedule_dates: deletedSchedules,
      });
    }
  }
}

async function createAndDeleteSchedulesForCompanies(
  client,
  companyEmpPromises
) {
  const companyEmps = await Promise.all(companyEmpPromises);

  for (const companyPromise of companyEmps) {
    const company = await companyPromise;

    const currentYear = new Date().getFullYear();
    const firstDayThisYear = new Date(currentYear, 0, 1); // 1 Januari thn ini
    const lastDayThisYear = new Date(currentYear, 11, 31); // 31 Januari thn ini

    const startDate = getRandomDate(firstDayThisYear, lastDayThisYear);
    const endDate = getRandomDate(startDate, lastDayThisYear);

    const start_date = formatDate(startDate);
    const end_date = formatDate(endDate);

    const createSchedules = await createSchedulesForCompany(
      client,
      company.username,
      start_date,
      end_date
    );

    const deleteStartDate = getRandomDate(startDate, endDate);
    const deleteEndDate = getRandomDate(deleteStartDate, endDate);
    const delete_start_date = formatDate(deleteStartDate);
    const delete_end_date = formatDate(deleteEndDate);

    const deleteSchedules = await deleteSchedulesForCompany(
      client,
      company.username,
      delete_start_date,
      delete_end_date
    );
  }
}

function getRandomDate(start, end) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

function formatDate(date) {
  return moment(date).format("YYYY-MM-DD");
}

function kurangiSatuHari(startDateStr) {
  let startDate = new Date(startDateStr);
  startDate.setDate(startDate.getDate() - 1);
  let newDateStr = startDate.toISOString().slice(0, 10);
  return newDateStr;
}

const main = async () => {
  try {
    await client.connect();
    const database = client.db(dbName);
    await database.dropDatabase();

    const adminPromises = createAdminDatas(2);
    const admins = await Promise.all(adminPromises);
    await database.collection("users").insertMany(admins);

    const employeePromises = createEmployeeDatas(10);
    const employees = await Promise.all(employeePromises);
    await database.collection("users").insertMany(employees);

    const companyPromises = createCompaniesDatas(4);
    const companies = await Promise.all(companyPromises);
    await database.collection("users").insertMany(companies);

    const companyEmpPromises = createCompaniesWithEmployeeDatas(4, client);
    await Promise.all(companyEmpPromises);

    const topUpPromises = createTopUpDatas(6, client);
    await Promise.all(topUpPromises);

    await createAndDeleteSchedulesForCompanies(client, companyPromises);
    await createAndDeleteSchedulesForCompanies(client, companyEmpPromises);

    console.log("OK");
  } catch (error) {
    console.error(error);
  } finally {
    await client.close();
    process.exit(0);
  }
};

main();
