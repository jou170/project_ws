const { faker } = require("@faker-js/faker");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

faker.seed(42);

let usedEmployees = [];

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
    employee = await collection.findOne({
      role: "employee",
      company: "",
    });
    if (employee && !usedEmployees.includes(employee.username)) {
      isUnique = true;
    }
  }
  const invitationCode = await generateInvitationCode(collection);

  const companyData = {
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

const { MongoClient } = require("mongodb");
const url = "mongodb://localhost:27017";
const client = new MongoClient(url, { family: 4 });
const dbName = "coba";

const main = async () => {
  try {
    await client.connect();
    const database = client.db(dbName);

    const employeePromises = createEmployeeDatas(10);
    const adminPromises = createAdminDatas(2);
    const companyPromises = createCompaniesDatas(2);
    const companyEmpPromises = createCompaniesWithEmployeeDatas(3, client);

    const employees = await Promise.all(employeePromises);
    const admins = await Promise.all(adminPromises);
    const companies = await Promise.all(companyPromises);
    const companiesEmp = await Promise.all(companyEmpPromises);

    await database.dropDatabase();
    await database.collection("users").insertMany(employees);
    await database.collection("users").insertMany(admins);
    await database.collection("users").insertMany(companies);
    await database.collection("users").insertMany(companiesEmp);

    console.log("OK");
  } catch (error) {
    console.error(error);
  } finally {
    await client.close();
    process.exit(0);
  }
};

main();
