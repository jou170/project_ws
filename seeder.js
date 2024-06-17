const { faker } = require("@faker-js/faker");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");

faker.seed(42);

let usedEmployees = [];
let usedCompany = [];
let topup_id = 0;

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
  const database = client.db("coba");
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

  const database = client.db("coba");
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
    { $set: { company: name } }
  );

  usedEmployees.push(employee.username);
  return companyData;
}

async function createTopUp(client) {
  const database = client.db("coba");
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
      created: datetime,
    };
    await database.collection("topups").insertOne(topup);
  } else if (random === 2 || random == 3) {
    topup = {
      _id: new ObjectId(),
      topup_id: topup_id,
      username: company.username,
      amount: randomAmount.toString(),
      status: "approved",
      created: datetime,
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
      await database.collection("transactions").insertOne({
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
      created: datetime,
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

const url = "mongodb://localhost:27017";
const client = new MongoClient(url, { family: 4 });
const dbName = "coba";

const main = async () => {
  try {
    await client.connect();
    const database = client.db(dbName);
    await database.dropDatabase();

    const employeePromises = createEmployeeDatas(10);
    const employees = await Promise.all(employeePromises);
    await database.collection("users").insertMany(employees);

    const adminPromises = createAdminDatas(2);
    const admins = await Promise.all(adminPromises);
    await database.collection("users").insertMany(admins);

    const companyPromises = createCompaniesDatas(4);
    const companies = await Promise.all(companyPromises);
    await database.collection("users").insertMany(companies);

    const companyEmpPromises = createCompaniesWithEmployeeDatas(4, client);
    await Promise.all(companyEmpPromises);

    const topUpPromises = createTopUpDatas(6, client);
    await Promise.all(topUpPromises);

    console.log("OK");
  } catch (error) {
    console.error(error);
  } finally {
    await client.close();
    process.exit(0);
  }
};

main();
