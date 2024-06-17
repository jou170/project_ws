const Joi = require("joi").extend(require("@joi/date"));
const client = require("../database/database");
const crypto = require("crypto");
require("dotenv").config();

function formateddate() {
  let date = new Date();
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

const viewEmployeePicture = async (req, res) => {
  const { username } = req.params;

  await client.connect();
  const collection = client.db("proyek_ws").collection("users");

  let employee = await collection.findOne({ username, role: "employee" });
  if (!employee) {
    return res.status(404).json({
      message: "Employee not found",
    });
  }

  if (employee.company != req.body.user.username) {
    return res.status(403).json({
      message: "This employee is not associated with this company",
    });
  }

  return res.status(200).sendFile(employee.profile_picture, { root: "." });
};

const getEmployeesSchema = Joi.object({
  name: Joi.string().optional(),
  limit: Joi.number()
    .integer()
    .min(1)
    .optional()
    .default(10)
    .when("offset", { is: Joi.exist(), then: Joi.required() }),
  offset: Joi.number().integer().min(1).optional(),
});

const getEmployees = async (req, res) => {
  const { name, offset } = req.query;
  let { limit } = req.query;
  const { user } = req.body;
  const { error } = getEmployeesSchema.validate({ name, limit, offset });

  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    let employeeDetails;
    const mainUser = await database
      .collection("users")
      .findOne({ username: user.username });

    if (!mainUser) {
      return res.status(404).send({ message: "Company not found" });
    }

    const employeeUsernames = mainUser.employees;

    const nameQuery = req.query.name || "";
    const nameRegex = new RegExp(nameQuery, "i");

    employeeDetails = await database
      .collection("users")
      .find(
        {
          username: { $in: employeeUsernames },
          name: { $regex: nameRegex },
        },
        { projection: { username: 1, email: 1, name: 1, _id: 0 } }
      )
      .toArray();

    if (limit && offset) {
      employeeDetails = employeeDetails.slice(
        limit * (offset - 1),
        limit * offset
      );
    } else if (limit) {
      employeeDetails = employeeDetails.slice(0, limit);
    } else if (!limit) {
      limit = 10;
      employeeDetails = employeeDetails.slice(0, limit);
    }

    const totalEmployees = mainUser.employees.length;
    const response = {
      total_employees: totalEmployees,
      total_employees_filtered: employeeDetails.length,
      employees_filtered: employeeDetails,
    };

    return res.status(200).send(response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const employeeSchema = Joi.object({
  username: Joi.string().min(1).required(),
});

const getEmployeesByUsername = async (req, res) => {
  const { user } = req.body;
  const { username } = req.params;
  const { error, value } = employeeSchema.validate({ username });

  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    let employeeDetail;
    const mainUser = await database
      .collection("users")
      .aggregate([
        {
          $match: {
            username: user.username,
            employees: {
              $in: [username],
            },
          },
        },
      ])
      .toArray();

    if (mainUser.length == 0) {
      return res.status(404).send({ message: "Employee not found" });
    }

    employeeDetail = await database.collection("users").findOne(
      {
        username: username,
      },
      {
        projection: {
          _id: 0,
          username: 1,
          name: 1,
          email: 1,
          phone_number: 1,
          address: 1,
        },
      }
    );
    return res.status(200).send(employeeDetail);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const removeEmployeesFromCompany = async (req, res) => {
  const { user } = req.body;
  const { username } = req.params;
  const { error, value } = employeeSchema.validate({ username });

  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const mainUser = await database
      .collection("users")
      .aggregate([
        {
          $match: {
            username: user.username,
            employees: {
              $in: [username],
            },
          },
        },
      ])
      .toArray();

    if (mainUser.length == 0) {
      return res.status(404).send({ message: "Employee not found" });
    }

    const result = await database.collection("users").updateOne(
      { username: user.username },
      {
        $pull: {
          employees: username,
        },
      }
    );

    await database
      .collection("users")
      .updateOne({ username: username }, { $set: { company: "" } });

    if (result) {
      return res.status(200).send({
        message: `Successfully remove employee ${username} from company ${user.username}`,
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const upgradePlanSchema = Joi.object({
  plan_type: Joi.string().valid("standard", "premium").required(),
});

const checkBalance = (currentPlan, targetPlan, balance) => {
  const cost = {
    "free-standard": 30,
    "free-premium": 50,
    "standard-premium": 30,
  };
  const key = `${currentPlan}-${targetPlan}`;
  return balance >= cost[key]
    ? { sufficient: true, cost: cost[key] }
    : { sufficient: false, cost: 0 };
};

const upgradeCompanyPlanType = async (req, res) => {
  const { plan_type } = req.body;
  const username = req.body.user.username;

  try {
    const { error } = upgradePlanSchema.validate({ plan_type });
    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message.replace(/"/g, ""))
        .join("; ");
      return res.status(400).json({ message: errorMessage });
    }

    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("users");

    const company = await collection.findOne({ username });
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (company.plan_type === "premium") {
      return res.status(400).json({ message: "Has reached max plan type" });
    }

    if (company.plan_type === plan_type) {
      return res.status(400).json({ message: `Already on ${plan_type} plan` });
    }

    let hasSufficientBalance = false;
    let cost = 0;

    if (
      company.plan_type === "free" &&
      (plan_type === "standard" || plan_type === "premium")
    ) {
      const balanceCheck = checkBalance(
        company.plan_type,
        plan_type,
        company.balance
      );
      hasSufficientBalance = balanceCheck.sufficient;
      cost = balanceCheck.cost;
    } else if (company.plan_type === "standard" && plan_type === "premium") {
      const balanceCheck = checkBalance(
        company.plan_type,
        plan_type,
        company.balance
      );
      hasSufficientBalance = balanceCheck.sufficient;
      cost = balanceCheck.cost;
    }

    if (!hasSufficientBalance) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const newBalance = parseFloat(
      parseFloat(company.balance) - parseFloat(cost)
    );

    const result = await collection.updateOne(
      { username },
      { $set: { plan_type, balance: newBalance } }
    );

    if (result.modifiedCount === 0) {
      return res.status(500).json({ message: "Failed to upgrade plan type" });
    }

    const transCollection = database.collection("transactions");
    const latestTrans = await transCollection.findOne(
      {},
      { sort: { transaction_id: -1 } }
    );
    const newTransactionId = latestTrans ? latestTrans.transaction_id + 1 : 1;
    cost = parseFloat(cost.toFixed(2));

    const trans = await transCollection.insertOne({
      transaction_id: newTransactionId,
      username: username,
      type: `Upgrade plan type`,
      datetime: formateddate(),
      charge: cost,
      detail: `Upgrade plan type from ${req.body.user.plan_type} to ${plan_type}`,
    });

    if (trans.modifiedCount === 0) {
      return res
        .status(500)
        .json({ message: "Failed to save the transaction" });
    }

    return res
      .status(200)
      .json({ message: `Successful upgrade plan type to ${plan_type}` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

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

const invitationLimitSchema = Joi.object({
  invitation_limit: Joi.number().integer().min(1).required(),
});

const generateCompanyInvitationCode = async (req, res) => {
  const { invitation_limit } = req.body;
  const username = req.body.user.username;

  try {
    const { error } = invitationLimitSchema.validate({ invitation_limit });
    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message.replace(/"/g, ""))
        .join("; ");
      return res.status(400).json({ message: errorMessage });
    }

    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("users");

    const company = await collection.findOne({ username });
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const invitationCode = await generateInvitationCode(collection);

    const parsedInvitationLimit = parseInt(invitation_limit, 10);

    const result = await collection.updateOne(
      { username },
      {
        $set: {
          invitation_code: invitationCode,
          invitation_limit: parsedInvitationLimit,
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(500)
        .json({ message: "Failed to generate invitation code" });
    }

    return res.status(200).json({
      invitation_code: invitationCode,
      invitation_limit,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const amountSchema = Joi.object({
  amount: Joi.number()
    .min(5)
    .max(1000)
    .required()
    .custom((value, helpers) => {
      if (value.toFixed(2) != value) {
        return helpers.error("amount.invalid");
      }
      return value;
    }, "Decimal precision validation")
    .messages({
      "amount.invalid": "Amount must have at most two decimal places",
    }),
});

module.exports = {
  viewEmployeePicture,
  getEmployees,
  getEmployeesByUsername,
  removeEmployeesFromCompany,
  upgradeCompanyPlanType,
  generateCompanyInvitationCode,
};
