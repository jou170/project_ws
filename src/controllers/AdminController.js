const Joi = require("joi");
const jwt = require("jsonwebtoken");
const client = require("../database/database");
require("dotenv").config();

const getCompaniesSchema = Joi.object({
  plan_type: Joi.string().valid("free", "standard", "premium").optional(),
  limit: Joi.number()
    .integer()
    .min(1)
    .optional()
    .default(10)
    .when("offset", { is: Joi.exist(), then: Joi.required() }),
  offset: Joi.number().integer().min(1).optional(),
});
const getCompanies = async (req, res) => {
  const { offset, plan_type } = req.query;
  let { limit } = req.query;
  let companies;

  const { error } = getCompaniesSchema.validate({ plan_type, limit, offset });

  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");

    if (plan_type == "free") {
      companies = await database
        .collection("users")
        .find(
          { role: "company", plan_type: "free" },
          { projection: { username: 1, name: 1, plan_type: 1, employees: 1 } }
        )
        .toArray();
    } else if (plan_type == "standard") {
      companies = await database
        .collection("users")
        .find(
          { role: "company", plan_type: "standard" },
          { projection: { username: 1, name: 1, plan_type: 1, employees: 1 } }
        )
        .toArray();
    } else if (plan_type == "premium") {
      companies = await database
        .collection("users")
        .find(
          { role: "company", plan_type: "premium" },
          { projection: { username: 1, name: 1, plan_type: 1, employees: 1 } }
        )
        .toArray();
    } else {
      companies = await database
        .collection("users")
        .find(
          { role: "company" },
          { projection: { username: 1, name: 1, plan_type: 1, employees: 1 } }
        )
        .toArray();
    }

    if (limit && offset) {
      companies = companies.slice(limit * (offset - 1), limit * offset);
    } else if (limit) {
      companies = companies.slice(0, limit);
    } else if (!limit) {
      limit = 10;
      companies = companies.slice(0, limit);
    }

    const companyPromises = companies.map(async (company) => {
      const transactions = await database
        .collection("transactions")
        .find({ username: company.username })
        .toArray();

      const totalSpent = transactions.reduce((sum, transaction) => {
        const charge = parseFloat(transaction.charge);
        return sum + (isNaN(charge) ? 0 : charge);
      }, 0);

      return {
        username: company.username,
        name: company.name,
        plan_type: company.plan_type,
        total_employees: company.employees.length,
        total_spent: `$${totalSpent.toFixed(2)}`,
      };
    });

    result = {
      companies: await Promise.all(companyPromises),
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching user data:", error);
    return res.status(500).send({ message: "Internal server error" });
  } finally {
    await client.close();
  }
};

const getCompaniesByUsername = async (req, res) => {
  const { username } = req.params;
  try {
    await client.connect();
    const database = client.db("proyek_ws");

    const company = await database
      .collection("users")
      .findOne(
        { username: username, role: "company" },
        { projection: { username: 1, name: 1, plan_type: 1, employees: 1 } }
      );

    if (!company) {
      return res.status(404).send({ message: "Company Not Found" });
    }

    const employeeUsernames = company.employees || [];

    const employeeDetails = await database
      .collection("users")
      .find({ username: { $in: employeeUsernames } })
      .toArray();

    const employees = employeeDetails.map((employee) => ({
      username: employee.username,
      name: employee.name,
      email: employee.email,
    }));

    const transactions = await database
      .collection("transactions")
      .find({ username: company.username })
      .toArray();

    const totalSpent = transactions.reduce((sum, transaction) => {
      const charge = parseFloat(transaction.charge);
      return sum + (isNaN(charge) ? 0 : charge);
    }, 0);

    const result = {
      company: {
        username: company.username,
        email: company.email,
        name: company.name,
        total_spent: `$${totalSpent.toFixed(2)}`,
        total_employees: company.employees.length,
        employees: employees,
      },
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching user data:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

module.exports = {
  getCompanies,
  getCompaniesByUsername,
};
