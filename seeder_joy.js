const { faker } = require("@faker-js/faker");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");

// Seed for faker to produce consistent results
faker.seed(42);

// Database connection details
const url = process.env.MONGODB_URI;
const dbName = "coba";
const client = new MongoClient(url, { family: 4 });

// Helper function to pad numbers for date formatting
function padNumber(number) {
  return number.toString().padStart(2, "0");
}

// Function to generate a unique invitation code
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

// Function to create employee data
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
    username,
    email,
    name,
    password: hashedPassword,
    role: "employee",
    phone_number,
    address,
    profile_picture: "/uploads/default.jpg",
    company: "",
  };
}

// Function to create admin data
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
    username,
    email,
    name,
    password: hashedPassword,
    role: "admin",
  };
}

// Function to create company data
async function createCompanyData(collection) {
  const name = faker.company.name();
  const splitName = name.split(/[\s\W]+/);
  const email = `${splitName[0].toLowerCase()}@gmail.com`;
  const username = `${splitName[0].toLowerCase()}`;
  const phone_number = faker.helpers.fromRegExp(/0[38]{1}1[0-9]{9}/);
  const address = faker.location.streetAddress({ useFullAddress: true });
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash("12345678", salt);
  const invitationCode = await generateInvitationCode(collection);

  return {
    _id: new ObjectId(),
    username,
    email,
    name,
    password: hashedPassword,
    role: "company",
    phone_number,
    address,
    profile_picture: "/uploads/default.jpg",
    balance: 0,
    plan_type: "free",
    invitation_code: invitationCode,
    invitation_limit: 10,
    employees: [],
  };
}

// Function to create company data with an assigned employee
async function createCompanyWithEmployeeData(client) {
  const database = client.db(dbName);
  const collection = database.collection("users");
  const companyData = await createCompanyData(collection);

  // Assign an unassigned employee to the company
  let employee;
  let isUnique = false;
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

    if (employee) {
      isUnique = true;
    }
  }

  companyData.employees.push(employee.username);
  await collection.insertOne(companyData);
  await collection.updateOne(
    { username: employee.username },
    { $set: { company: companyData.username } }
  );
  return companyData;
}

// Function to create a top-up transaction
async function createTopUp(client) {
  const database = client.db(dbName);
  const collection = database.collection("users");
  const companies = await collection.find({ role: "company" }).toArray();
  const randomIndex = Math.floor(Math.random() * companies.length);
  const company = companies[randomIndex];

  const randomAmount = Math.floor(Math.random() * (100 - 50 + 1)) + 50;
  const currentDate = new Date();
  const datetime = `${currentDate.getFullYear()}-${padNumber(
    currentDate.getMonth() + 1
  )}-${padNumber(currentDate.getDate())} ${padNumber(
    currentDate.getHours()
  )}:${padNumber(currentDate.getMinutes())}`;

  let topup = {
    _id: new ObjectId(),
    topup_id: Date.now(), // Using timestamp for unique ID
    username: company.username,
    amount: randomAmount.toString(),
    status: "approved",
    datetime,
  };

  await database.collection("topups").insertOne(topup);
  const newBalance = parseFloat(company.balance) + parseFloat(randomAmount);
  await collection.updateOne(
    { username: company.username },
    { $set: { balance: newBalance.toFixed(2) } }
  );

  return topup;
}

// Function to create a schedule
async function createSchedule(client) {
  const database = client.db(dbName);
  const collection = database.collection("users");
  const companies = await collection.find({ role: "company" }).toArray();
  const randomIndex = Math.floor(Math.random() * companies.length);
  const company = companies[randomIndex];

  const currentDate = new Date();
  const futureDate = new Date();
  futureDate.setDate(currentDate.getDate() + Math.floor(Math.random() * 30));
  const date = futureDate.toISOString().split("T")[0];
  const day = futureDate.toLocaleString("en-US", { weekday: "long" });

  const schedule = {
    _id: new ObjectId(),
    username: company.username,
    date,
    day,
    attendance: [],
  };

  await database.collection("schedules").insertOne(schedule);
  return schedule;
}

// Function to create a transaction
async function createTransaction(
  client,
  username,
  type,
  charge,
  detail,
  schedule_dates = []
) {
  const database = client.db(dbName);
  const transaction = {
    _id: new ObjectId(),
    transaction_id: Date.now(), // Using timestamp for unique ID
    username,
    type,
    datetime: new Date().toISOString(),
    charge,
    detail,
    schedule_dates,
  };

  await database.collection("transactions").insertOne(transaction);
  return transaction;
}

// Main function to seed the database
const main = async () => {
  const currentDate = new Date(); // Define currentDate here
  try {
    await client.connect();
    const database = client.db(dbName);
    await database.dropDatabase();

    // Create and insert employees
    const employeePromises = [];
    for (let i = 0; i < 10; i++) {
      employeePromises.push(createEmployeeData());
    }
    const employees = await Promise.all(employeePromises);
    await database.collection("users").insertMany(employees);

    // Create and insert admins
    const adminPromises = [];
    for (let i = 0; i < 2; i++) {
      adminPromises.push(createAdminData());
    }
    const admins = await Promise.all(adminPromises);
    await database.collection("users").insertMany(admins);

    // Create and insert companies
    const companyPromises = [];
    for (let i = 0; i < 4; i++) {
      companyPromises.push(createCompanyData(database.collection("users")));
    }
    const companies = await Promise.all(companyPromises);
    await database.collection("users").insertMany(companies);

    // Create and insert companies with employees
    const companyWithEmployeePromises = [];
    for (let i = 0; i < 4; i++) {
      companyWithEmployeePromises.push(createCompanyWithEmployeeData(client));
    }
    await Promise.all(companyWithEmployeePromises);

    // Create and insert top-ups
    const topUpPromises = [];
    for (let i = 0; i < 6; i++) {
      topUpPromises.push(createTopUp(client));
    }
    await Promise.all(topUpPromises);

    // Create and insert schedules
    const schedulePromises = [];
    for (let i = 0; i < 6; i++) {
      schedulePromises.push(createSchedule(client));
    }
    await Promise.all(schedulePromises);

    // Create and insert transactions
    const transactionPromises = [];
    const companyUsernames = companies.map((company) => company.username);

    for (let i = 0; i < companyUsernames.length; i++) {
      const username = companyUsernames[i];

      // Upgrade plan type transactions
      const upgradeTypes = [
        { from: "free", to: "standard", charge: 30 },
        { from: "standard", to: "premium", charge: 30 },
        { from: "free", to: "premium", charge: 50 },
      ];
      const upgradeType = faker.helpers.arrayElement(upgradeTypes);
      const upgradeDetail = `Upgrade plan type from ${upgradeType.from} to ${upgradeType.to}`;
      transactionPromises.push(
        createTransaction(
          client,
          username,
          "Upgrade plan type",
          upgradeType.charge,
          upgradeDetail
        )
      );

      // Create schedules transactions
      const scheduleDates = [];
      const numSchedules = faker.number.int({ min: 1, max: 10 });
      for (let j = 0; j < numSchedules; j++) {
        const futureDate = new Date();
        futureDate.setDate(currentDate.getDate() + j + 1);
        scheduleDates.push(futureDate.toISOString().split("T")[0]);
      }
      const createDetail = `Schedules created from ${scheduleDates[0]} to ${
        scheduleDates[scheduleDates.length - 1]
      } with ${scheduleDates.length} active days`;
      transactionPromises.push(
        createTransaction(
          client,
          username,
          "Create schedules",
          scheduleDates.length * 0.1,
          createDetail,
          scheduleDates
        )
      );

      // Delete schedules transactions
      const deleteDates = scheduleDates.slice(
        0,
        Math.floor(scheduleDates.length / 2)
      );
      const deleteDetail = `Schedules deleted from ${deleteDates[0]} to ${
        deleteDates[deleteDates.length - 1]
      } with ${deleteDates.length} schedules affected`;
      transactionPromises.push(
        createTransaction(
          client,
          username,
          "Delete schedules",
          deleteDates.length * 0.1,
          deleteDetail,
          deleteDates
        )
      );
    }

    await Promise.all(transactionPromises);

    console.log("Database seeding completed successfully");
  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    await client.close();
  }
};

main().catch(console.error);
