const Joi = require("joi");
const jwt = require("jsonwebtoken");
const client = require("../database/database");
const crypto = require("crypto");
require("dotenv").config();

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

    const newBalance = company.balance - cost;

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

module.exports = { upgradeCompanyPlanType, generateCompanyInvitationCode };
