const { faker } = require("@faker-js/faker");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

faker.seed(42);

async function createEmployeeData() {
  const sex = faker.person.sexType();
  const firstName = faker.person.firstName(sex);
  const lastName = faker.person.lastName(sex);
  const name = `${firstName} ${lastName}`;
  const email = `${firstName.toLowerCase()}@gmail.com`;
  const username = `${firstName.toLowerCase()}`;
  const phone_number = faker.helpers.fromRegExp(/0[38]{1}1[0-9]{7,10}/);
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
  const phone_number = faker.helpers.fromRegExp(/0[38]{1}1[0-9]{7,10}/);
  const address = faker.location.streetAddress({ useFullAddress: true });
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash("12345678", salt);

  return {
    username: username,
    email: email,
    name: name,
    password: hashedPassword,
    role: "admin",
    phone_number: phone_number,
    address: address,
    profile_picture: "/uploads/default.jpg",
    company: "",
  };
}
async function createCompaniesData() {
  const name = faker.company.name();
  const splitName = name.split(/[\s\W]+/);
  const email = `${splitName[0]}${splitName[1]}@gmail.com`;
  const username = `${splitName[0]}${splitName[1]}`;
  const phone_number = faker.helpers.fromRegExp(/0[38]{1}1[0-9]{7,10}/);
  const address = faker.location.streetAddress({ useFullAddress: true });
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash("12345678", salt);
  await client.connect();
  const database = client.db("proyek_ws");
  const collection = database.collection("users");
  const invitationCode = generateInvitationCode(collection);

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

const generateInvitationCode = async (collection) => {
  let isUnique = false;
  let invitationCode;

  while (!isUnique) {
    const buffer = await crypto.randomBytes(6);

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

// function createRandomPost() {
//   const n = faker.number.int({ min: 0, max: 10 });
//   const comments = [];
//   const postDate = faker.date.recent({ days: 365 });
//   for (let i = 0; i < n; i++) {
//     comments.push({
//       content: faker.lorem.sentence(),
//       createdAt: faker.date.soon({ days: 100, refDate: postDate }),
//     });
//   }
//   return {
//     title: faker.lorem.sentence(),
//     content: faker.lorem.paragraph(),
//     createdAt: postDate,
//     comments: comments,
//   };
// }

// function createRandomPosts(n, accounts) {
//   const posts = [];
//   const usernames = accounts.map((a) => a._id);
//   const accountsSmall = accounts.map((a) => ({
//     _id: a._id,
//     avatar: a.avatar,
//   }));
//   for (let i = 0; i < n; i++) {
//     const post = createRandomPost();
//     post.author = faker.helpers.arrayElement(usernames);
//     post.likes = faker.helpers.arrayElements(
//       usernames,
//       faker.number.int({ min: 0, max: 10 })
//     );
//     for (let j = 0; j < post.comments.length; j++) {
//       post.comments[j].commenter = faker.helpers.arrayElement(accountsSmall);
//     }
//     posts.push(post);
//   }
//   return posts;
// }

const { MongoClient } = require("mongodb");
const url = "mongodb://localhost:27017";
// 4 dan 6 itu menandakan kita mau pakai IPv4 atau IPv6
const client = new MongoClient(url, { family: 4 });
const dbName = "coba";

const main = async () => {
  try {
    await client.connect();
    const database = client.db(dbName);

    const employeePromises = createEmployeeDatas(10);
    const adminPromises = createAdminDatas(2);
    const companyPromises = createCompaniesDatas(3);

    const employees = await Promise.all(employeePromises);
    const admins = await Promise.all(adminPromises);
    const companies = await Promise.all(companyPromises);

    await database.dropDatabase();
    await database.collection("users").insertMany(employees);
    await database.collection("users").insertMany(admins);
    await database.collection("users").insertMany(companies);

    const query = { fullName: /ow/ };
    const projection = { username: 1, name: 1 };
    const options = { limit: 5, skip: 1 };

    const result = await database
      .collection("users")
      .find(query, { projection })
      .limit(options.limit)
      .skip(options.skip)
      .toArray();

    console.log(result);
    console.log("OK");
  } catch (error) {
    console.log(error);
  } finally {
    await client.close();
    process.exit(0); // Exit Node.js process
  }
};

main();
