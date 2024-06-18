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
const dbName = "proyek_ws";

let usedCompany = [];
let topup_id = 0;
let transaction_id = 0;

const database = client.db(dbName);
const usersCollection = database.collection("users");

async function createEmployeeData(company = "") {
  let username, email;
  let isUnique = false;

  while (!isUnique) {
    const sex = faker.person.sexType();
    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName(sex);
    const name = `${firstName} ${lastName}`;
    email = `${firstName.toLowerCase()}@gmail.com`;
    username = `${firstName.toLowerCase()}`;
    const phone_number = faker.helpers.fromRegExp(/0[38]{1}1[0-9]{9}/);
    const address = faker.location.streetAddress({ useFullAddress: true });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("12345678", salt);

    const existingUser = await usersCollection.findOne({
      $or: [{ username: username }, { email: email }],
    });

    if (!existingUser) {
      isUnique = true;

      const newEmployee = {
        _id: new ObjectId(),
        username: username,
        email: email,
        name: name,
        password: hashedPassword,
        role: "employee",
        phone_number: phone_number,
        address: address,
        profile_picture: "/uploads/default.jpg",
        company: company,
      };
      await usersCollection.insertOne(newEmployee);

      return username;
    }
  }
}

async function createAdminData() {
  let username, email;
  let isUnique = false;

  while (!isUnique) {
    const sex = faker.person.sexType();
    const firstName = faker.person.firstName(sex);
    const lastName = faker.person.lastName(sex);
    const name = `${firstName} ${lastName}`;
    email = `${firstName.toLowerCase()}@gmail.com`;
    username = `${firstName.toLowerCase()}`;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("12345678", salt);

    const existingUser = await usersCollection.findOne({
      $or: [{ username: username }, { email: email }],
    });

    if (!existingUser) {
      isUnique = true;

      const newEmployee = {
        _id: new ObjectId(),
        username: username,
        email: email,
        name: name,
        password: hashedPassword,
        role: "admin",
      };
      await usersCollection.insertOne(newEmployee);
    }
  }
}

async function createCompaniesData() {
  let username, email;
  let isUnique = false;

  while (!isUnique) {
    const name = faker.company.name();
    const splitName = name.split(/[\s\W]+/);
    email = `${splitName[0].toLowerCase()}@gmail.com`;
    username = `${splitName[0].toLowerCase()}`;
    const phone_number = faker.helpers.fromRegExp(/0[38]{1}1[0-9]{9}/);
    const address = faker.location.streetAddress({ useFullAddress: true });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("12345678", salt);
    const invitationCode = await generateInvitationCode(usersCollection);

    const existingUser = await usersCollection.findOne({
      $or: [{ username: username }, { email: email }],
    });

    if (!existingUser) {
      isUnique = true;

      const newCompany = {
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

      await usersCollection.insertOne(newCompany);

      return username;
    }
  }
}

async function createCompaniesWithEmployeeData(numEmployees) {
  let username, email;
  let isUnique = false;

  while (!isUnique) {
    const name = faker.company.name();
    const splitName = name.split(/[\s\W]+/);
    email = `${splitName[0].toLowerCase()}@gmail.com`;
    username = `${splitName[0].toLowerCase()}`;
    const phone_number = faker.helpers.fromRegExp(/0[38]{1}1[0-9]{9}/);
    const address = faker.location.streetAddress({ useFullAddress: true });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("12345678", salt);
    const invitationCode = await generateInvitationCode(usersCollection);

    const existingUser = await usersCollection.findOne({
      $or: [{ username: username }, { email: email }],
    });

    if (!existingUser) {
      isUnique = true;

      let employees = [];
      for (let i = 0; i < numEmployees; i++) {
        employees.push(await createEmployeeData(username));
      }

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
        invitation_limit: 10,
        employees: employees,
      };

      await usersCollection.insertOne(companyData);
      return username;
    }
  }
}

async function createTopUp() {
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

    // let randomNum = Math.floor(Math.random() * 3) + 1;
    // if (randomNum == 1 || randomNum == 3) {
    //   newBalance = newBalance - 30;
    //   await database
    //     .collection("users")
    //     .updateOne(
    //       { username: company.username },
    //       { $set: { balance: newBalance, plan_type: "standard" } }
    //     );
    //   transaction_id++;
    //   await database.collection("transactions").insertOne({
    //     transaction_id: transaction_id,
    //     username: company.username,
    //     type: `Upgrade plan type from free to standard`,
    //     date: datetime,
    //     charge: 30,
    //   });
    // }
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

async function createAdminDatas(n) {
  for (let i = 0; i < n; i++) {
    await createAdminData();
  }
}

async function createEmployeeDatas(n, company = "") {
  const users = [];
  for (let i = 0; i < n; i++) {
    users.push(await createEmployeeData(company));
  }
  return users;
}

async function createCompaniesDatas(n) {
  const users = [];
  for (let i = 0; i < n; i++) {
    users.push(await createCompaniesData());
  }
  return users;
}

async function createCompaniesWithEmployeeDatas(n, numEmployees) {
  const users = [];
  for (let i = 0; i < n; i++) {
    users.push(await createCompaniesWithEmployeeData(numEmployees));
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

async function getUpgradeCost(currentPlan, newPlan) {
  const costs = {
    free: { standard: 30, premium: 50 },
    standard: { premium: 30 },
  };

  let cost = costs[currentPlan][newPlan];
  cost = parseFloat(cost.toFixed(2));

  return cost;
}

async function upgradePlanType(companyPromises) {
  const transCollection = database.collection("transactions");

  const companyList = await Promise.all(companyPromises);
  for (const companyUsername of companyList) {
    const username = await companyUsername;
    const company = await usersCollection.findOne({ username });

    const { plan_type, balance } = company;
    let newPlanType;
    let cost;

    if (plan_type === "free") {
      const upgradeOptions = ["standard", "premium"];
      newPlanType = faker.helpers.arrayElement(upgradeOptions);
      cost = await getUpgradeCost(plan_type, newPlanType);
    } else if (plan_type === "standard") {
      newPlanType = "premium";
      cost = await getUpgradeCost(plan_type, newPlanType);
    }

    if (plan_type === "premium") {
      continue;
    }

    if (balance >= cost) {
      let newBalance = parseFloat(balance) - parseFloat(cost);
      newBalance = parseFloat(newBalance.toFixed(2));
      await usersCollection.updateOne(
        { username },
        { $set: { plan_type: newPlanType, balance: newBalance } }
      );

      let currentDate = new Date();
      let datetime = `${currentDate.getFullYear()}-${padNumber(
        currentDate.getMonth() + 1
      )}-${padNumber(currentDate.getDate())} ${padNumber(
        currentDate.getHours()
      )}:${padNumber(currentDate.getMinutes())}`;

      transaction_id++;
      await transCollection.insertOne({
        transaction_id: transaction_id,
        username: username,
        type: "Upgrade plan type",
        datetime: datetime,
        charge: cost,
        detail: `Upgrade plan type from ${plan_type} to ${newPlanType}`,
      });
    }
  }
}

async function createSchedulesForCompany(username, start_date, end_date) {
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

async function deleteSchedulesForCompany(username, start_date, end_date) {
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

async function createAndDeleteSchedulesForCompanies(companyEmpPromises) {
  const companyEmps = await Promise.all(companyEmpPromises);

  for (const companyPromise of companyEmps) {
    const company = await companyPromise;

    const currentYear = new Date().getFullYear();
    const firstDayThisYear = new Date(currentYear, 0, 1); // 1 Januari thn ini
    const lastDayThisYear = new Date(currentYear, 11, 31); // 31 Desember thn ini

    const startDate = getRandomDate(firstDayThisYear, lastDayThisYear);
    const endDate = getRandomDate(startDate, lastDayThisYear);

    const start_date = formatDate(startDate);
    const end_date = formatDate(endDate);

    await createSchedulesForCompany(company, start_date, end_date);

    const deleteStartDate = getRandomDate(startDate, endDate);
    const deleteEndDate = getRandomDate(deleteStartDate, endDate);
    const delete_start_date = formatDate(deleteStartDate);
    const delete_end_date = formatDate(deleteEndDate);

    await deleteSchedulesForCompany(
      company,
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

    await createAdminDatas(1);

    await createEmployeeDatas(5); // 5 employee baru tanpa masuk company

    const listUsernameCompany = await createCompaniesDatas(4); // 4 company baru tanpa employee

    const listUsernameCompanyWithEmployee =
      await createCompaniesWithEmployeeDatas(2, 5); //2 company baru dengan 5 employees baru

    const topUpPromises = createTopUpDatas(6, client);
    await Promise.all(topUpPromises);

    await upgradePlanType(listUsernameCompany);
    await upgradePlanType(listUsernameCompanyWithEmployee);
    await upgradePlanType(listUsernameCompany);
    await upgradePlanType(listUsernameCompanyWithEmployee);

    await createAndDeleteSchedulesForCompanies(listUsernameCompany);
    await createAndDeleteSchedulesForCompanies(listUsernameCompanyWithEmployee);

    console.log("OK");
  } catch (error) {
    console.error(error);
  } finally {
    await client.close();
    process.exit(0);
  }
};

main();
