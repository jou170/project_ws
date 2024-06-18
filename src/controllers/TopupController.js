const Joi = require("joi").extend(require("@joi/date"));
const client = require("../database/database");
require("dotenv").config();

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
      datetime: datetime,
    });

    return res.status(201).send({
      topup_id: topup_id,
      amount: "$" + amount,
      status: "pending",
      datetime: datetime,
    });
  } catch (error) {
    res.status(500).send({ message: "Internal server error" });
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

const editTopupSchema = Joi.object({
  topup_id: Joi.string().required(),
  accept: Joi.string().valid("true", "false").required(),
});

const topupSchema = Joi.object({
  status: Joi.string().valid("approved", "rejected", "pending").optional(),
  limit: Joi.number()
    .integer()
    .min(1)
    .default(10)
    .optional()
    .when("offset", { is: Joi.exist(), then: Joi.required() }),
  offset: Joi.number().integer().min(1).optional(),
  date: Joi.string()
    .optional()
    .pattern(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
});

const getTopUpRequest = async (req, res) => {
  try {
    const { status, offset, date } = req.query;
    let { limit } = req.query;
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
              company_username: "$companyInfo.username",
              company_name: "$companyInfo.name",
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
              dateSubstring: { $substr: ["$datetime", 0, 10] },
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
    collection = collection.map((c) => {
      return {
        ...c,
        amount: `$${c.amount}`,
      };
    });
    if (status) {
      collection = collection.filter((item) => item.status === status);
    }
    if (limit && offset) {
      collection = collection.slice(limit * (offset - 1), limit * offset);
    } else if (limit) {
      collection = collection.slice(0, limit);
    } else if (!limit) {
      limit = 10;
      collection = collection.slice(0, limit);
    }

    if (collection.length == 0) {
      return res.status(404).send({ message: "List not found" });
    }

    return res.status(200).json(collection);
  } catch (error) {
    console.error("Error fetching user data:", error);
    return res.status(500).send({ message: "Internal server error" });
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
    let newBalance = oldBalance + balanceToAdd;
    newBalance = parseFloat(newBalance.toFixed(2));
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
    return res.status(500).send({ message: "Internal server error" });
  } finally {
    await client.close();
  }
};
module.exports = {
  getTopUpRequest,
  editTopUpRequest,
  companyTopUp,
};
