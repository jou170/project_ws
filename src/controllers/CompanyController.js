const Joi = require("joi");
const jwt = require("jsonwebtoken");
const client = require("../database/database");
const crypto = require("crypto");
require("dotenv").config();

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
  const { name, limit, offset } = req.query;
  const { user } = req.body;

  const { error, value } = getEmployeesSchema.validate({ name, limit, offset });

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

    if (name) {
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
    } else {
      employeeDetails = await database
        .collection("users")
        .find(
          { username: employeeUsernames },
          {
            projection: { username: 1, email: 1, name: 1, _id: 0 },
          }
        )
        .toArray();
    }

    if (limit && offset) {
      employeeDetails = employeeDetails.slice(
        limit * (offset - 1),
        limit * offset
      );
    } else if (limit) {
      employeeDetails = employeeDetails.slice(0, limit);
    }

    const totalEmployees = mainUser.employees.length;
    const response = {
      total_employee: totalEmployees,
      employees: employeeDetails,
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
          profile_picture: 1,
          phone_number: 1,
          address: 1,
        },
      }
    );
    const response = {
      employee: {
        username: employeeDetail.username,
        name: employeeDetail.name,
        email: employeeDetail.email,
        profile_picture: employeeDetail.profile_picture,
        phone_number: employeeDetail.phone_number,
        address: employeeDetail.address,
        absence: "",
      },
    };
    return res.status(200).send(response);
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

    const result = await database.collection("users").updateOne(
      { username: user.username },
      {
        $pull: {
          employees: username,
        },
      }
    );

    if (result) {
      return res.status(200).send({
        message: `Successfully delete ${username} from ${user.username}`,
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
  invitation_limit: Joi.number().integer().required(),
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
  amount: Joi.number().min(5).max(1000).required(),
});

const companyTopUp = async (req, res) => {
  const { user, amount } = req.body;
  try {
    const { error } = amountSchema.validate({ amount });
    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message.replace(/"/g, ""))
        .join("; ");
      return res.status(400).json({ message: errorMessage });
    }

    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("topups");

    const pendingTopup = await collection.findOne({
      username: user.username,
      status: "pending",
    });

    if (pendingTopup) {
      return res.status(400).send({
        message:
          "Please wait until latest topup attempt verified by our system",
      });
    }
    const currentDate = new Date();
    const datetime = `${currentDate.getFullYear()}-${padNumber(
      currentDate.getMonth() + 1
    )}-${padNumber(currentDate.getDate())} ${padNumber(
      currentDate.getHours()
    )}:${padNumber(currentDate.getMinutes())}`;

    function padNumber(number) {
      return number.toString().padStart(2, "0");
    }

    const topup_id = await generateTopupId();
    topup = await database.collection("topups").insertOne({
      topup_id: topup_id,
      username: user.username,
      amount: amount,
      status: "pending",
      created: datetime,
    });

    return res.status(200).send({
      topup_id: topup_id,
      amount: "$" + amount,
      status: "pending",
      time: datetime,
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).send("Internal server error");
  } finally {
    await client.close();
  }
};

async function generateTopupId() {
  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("topups");
    let newTopupId = 1;

    const lastTopup = await collection
      .find()
      .sort({ topup_id: -1 })
      .limit(1)
      .toArray();

    if (lastTopup.length === 1) {
      const lastTopupId = lastTopup[0].topup_id;
      newTopupId = lastTopupId.toString();
      const newTopupIdInt = parseInt(newTopupId, 10);
      newTopupId = newTopupIdInt + 1;
    }
    return newTopupId;
  } catch (error) {
    console.error("Error generating new topup ID:", error);
    throw error;
  }
}
module.exports = {
  getEmployees,
  getEmployeesByUsername,
  removeEmployeesFromCompany,
  upgradeCompanyPlanType,
  generateCompanyInvitationCode,
  companyTopUp,
};
