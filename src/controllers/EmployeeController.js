const Joi = require("joi");
const jwt = require("jsonwebtoken");
const client = require("../database/database");
require("dotenv").config();

function cekLimit(plan_type, length) {
  if (plan_type == "free" && length < 5) {
    return true;
  } else if (plan_type == "standard" && length < 50) {
    return true;
  } else if (plan_type == "premium" && length < 150) {
    return true;
  }
}

const joinCompany = async (req, res) => {
  const invitation_code = req.body.invitation_code;
  const user = req.body.user;

  if (!invitation_code || invitation_code == "") {
    return res.status(400).json({
      message: "Invitation code must be provided",
    });
  }

  const collection = client.db("proyek_ws").collection("users");
  let company = await collection.findOne({ invitation_code });

  if (!company) {
    return res.status(400).json({
      message: "Invalid invitation code",
    });
  }

  if (
    company.invitation_limit == 0 ||
    !cekLimit(company.plan_type, company.employees.length)
  ) {
    return res.status(400).json({
      message: "Invalid invitation code",
    });
  }

  if (user.company != "") {
    if (user.company == company.username) {
      return res.status(400).json({
        message: "You have joined this company",
      });
    } else {
      return res.status(400).json({
        message: "You have joined on a company",
      });
    }
  }

  // update user
  await collection.updateOne(
    { username: user.username },
    { $set: { company: company.username } }
  );

  // push employee to user
  await collection.updateOne(
    { username: company.username },
    {
      $set: { invitation_limit: company.invitation_limit - 1 },
      $push: {
        employees: user.username,
      },
    }
  );

  return res
    .status(200)
    .json({ message: `Successfully joined ${company.name}` });
};

const getEmployeeCompany = async (req, res) => {
  const collection = client.db("proyek_ws").collection("users");
  let company = await collection.findOne({ username: req.body.user.company });

  if (req.body.user.company == "") {
    return res.status(400).json({
      message: "You haven't joined any company",
    });
  }

  return res.json({
    company: {
      _id: company._id,
      email: company.email,
      name: company.name,
      phone_number: company.phone_number,
      address: company.address,
      profile_picture: company.profile_picture,
    },
  });
};

const viewAttendance = async (req, res) => {

}

const absence = async (req, res) => {

}

const viewSchedule = async (req, res) => {

}

module.exports = { joinCompany, getEmployeeCompany, viewAttendance, absence, viewSchedule };
