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
        { projection: { username: 1, name: 1, plan_type: 1, employees: 1 } }
      )
      .toArray();

    const result = {
      companies: collection.map((company) => ({
        username: company.username,
        name: company.name,
        plan_type: company.plan_type,
        total_employee: company.employees.length,
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
        { projection: { username: 1, name: 1, plan_type: 1, employees: 1 } } // Include name, plan_type, and employee fields
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
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const topupSchema = Joi.object({
  status: Joi.string().valid("approved", "rejected", "pending").optional(),
  limit: Joi.number().integer().min(1).optional().default(10),
  offset: Joi.number().integer().min(1).optional().default(0),
  date: Joi.string()
    .optional()
    .pattern(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
});
const editTopupSchema = Joi.object({
  topup_id: Joi.string().required(),
  accept: Joi.string().valid("true", "false").required(),
});

const getTopUpRequest = async (req, res) => {
  try {
    const { status, limit, offset, date } = req.query;
    const { user } = req.body;
    const { error } = topupSchema.validate({ status, limit, offset, date });
    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message.replace(/"/g, ""))
        .join("; ");
      return res.status(400).json({ message: errorMessage });
    }
    await client.connect();
    const database = client.db("proyek_ws");

    if (user.role == "company") {
      collection = await database
        .collection("topups")
        .aggregate([
          {
            $match: { username: user.username },
          },
          {
            $lookup: {
              from: "users",
              localField: "username",
              foreignField: "username",
              as: "companyInfo",
            },
          },
          {
            $unwind: "$companyInfo",
          },
          {
            $project: {
              _id: 0,
              topup_id: 1,
              datetime: 1,
              company_name: "$companyInfo.name",
              company_username: "$companyInfo.username",
              amount: 1,
              status: 1,
            },
          },
        ])
        .toArray();
    } else {
      collection = await database
        .collection("topups")
        .aggregate([
          {
            $lookup: {
              from: "users",
              localField: "username",
              foreignField: "username",
              as: "companyInfo",
            },
          },
          {
            $unwind: "$companyInfo",
          },
          {
            $project: {
              _id: 0,
              topup_id: 1,
              datetime: 1,
              company_name: "$companyInfo.name",
              company_username: "$companyInfo.username",
              amount: 1,
              status: 1,
            },
          },
        ])
        .toArray();
    }

    if (date) {
      collection = await database
        .collection("topups")
        .aggregate([
          {
            $lookup: {
              from: "users",
              localField: "username",
              foreignField: "username",
              as: "companyInfo",
            },
          },
          {
            $unwind: "$companyInfo",
          },
          {
            $addFields: {
              dateSubstring: { $substr: ["$created", 0, 10] },
            },
          },
          {
            $match: {
              dateSubstring: date,
            },
          },
          {
            $project: {
              _id: 0,
              topup_id: 1,
              created: 1,
              company_name: "$companyInfo.name",
              company_username: "$companyInfo.username",
              amount: 1,
              status: 1,
            },
          },
        ])
        .toArray();
    }
    if (status) {
      collection = collection.filter((item) => item.status === status);
    }
    const limitInt = limit ? parseInt(limit, 10) : null;
    const offsetInt = offset ? parseInt(offset, 10) : 0;

    if (limitInt !== null) {
      collection = collection.slice(offsetInt, offsetInt + limitInt);
    } else if (offsetInt) {
      collection = collection.slice(offsetInt);
    }

    if (collection.length == 0) {
      return res.status(404).send({ message: "List not found" });
    }

    return res.status(200).json(collection);
  } catch (error) {
    console.error("Error fetching user data:", error);
    return res.status(500).send("Internal server error");
  } finally {
    await client.close();
  }
};

const editTopUpRequest = async (req, res) => {
  try {
    const { topup_id } = req.params;
    const { accept } = req.body;
    const { error } = editTopupSchema.validate({ topup_id, accept });
    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message.replace(/"/g, ""))
        .join("; ");
      return res.status(400).json({ message: errorMessage });
    }

    await client.connect();
    const database = client.db("proyek_ws");
    const collection = await database
      .collection("topups")
      .findOne({ topup_id: parseInt(topup_id) });

    if (!collection) {
      return res.status(404).send({ message: "Top up request not found" });
    }
    if (collection.status === "approved") {
      return res
        .status(400)
        .send({ message: "Top up request already approved" });
    }
    if (collection.status === "rejected") {
      return res
        .status(400)
        .send({ message: "Top up request already rejected" });
    }

    const company = await database
      .collection("users")
      .findOne({ username: collection.username });

    let oldBalance = parseFloat(company.balance);
    let balanceToAdd = parseFloat(collection.amount);
    let newBalance = parseFloat(oldBalance + balanceToAdd);
    if (accept === "true") {
      await database
        .collection("users")
        .updateOne(
          { username: collection.username },
          { $set: { balance: newBalance } }
        );

      await database
        .collection("topups")
        .updateOne(
          { topup_id: parseInt(topup_id) },
          { $set: { status: "approved" } }
        );

      return res
        .status(200)
        .send({ message: `${company.name} top up approved` });
    } else if (accept === "false") {
      await database
        .collection("topups")
        .updateOne(
          { topup_id: parseInt(topup_id) },
          { $set: { status: "rejected" } }
        );

      return res
        .status(200)
        .send({ message: `${company.name} top up rejected` });
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
    return res.status(500).send("Internal server error");
  } finally {
    await client.close();
  }
};

module.exports = {
  getCompanies,
  getCompaniesByUsername,
  getTopUpRequest,
  editTopUpRequest,
};
