const Joi = require("joi");
const jwt = require("jsonwebtoken");
const client = require("../database/database");
require("dotenv").config();

const getCompanies = async (req, res) => {
  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const collection = await database
      .collection("users")
      .find(
        { role: "company" },
        { projection: { username: 1, name: 1, plan_type: 1, employee: 1 } }
      )
      .toArray();

    const result = {
      companies: collection.map((company) => ({
        username: company.username,
        name: company.name,
        plan_type: company.plan_type,
        total_employee: company.employee ? company.employee.length : 0,
        total_spent: 0,
      })),
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching user data:", error);
    return res.status(500).send("Internal server error");
  } finally {
    await client.close();
  }
};

const getCompaniesByUsername = async (req, res) => {
  const { username } = req.params;
  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const collection = await database
      .collection("users")
      .find(
        { username: username },
        { role: "company" },
        { projection: { username: 1, name: 1, plan_type: 1, employee: 1 } } // Include name, plan_type, and employee fields
      )
      .toArray();

    if (collection.length == 0) {
      return res.status(404).send({ message: "Company Not Found" });
    }

    const result = {
      company: collection.map((company) => ({
        username: company.username,
        name: company.name,
        plan_type: company.plan_type,
        total_employee: company.employees.length,
        total_spent: 0, // Assuming total_spent is 0 for now
      })),
    };

    return res.status(200).json(result);
    console.log(result);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).send("Internal server error");
  } finally {
    await client.close();
  }
};
const getTopUpRequest = async (req, res) => {};
const editTopUpRequest = async (req, res) => {};

module.exports = {
  getCompanies,
  getCompaniesByUsername,
  getTopUpRequest,
  editTopUpRequest,
};
