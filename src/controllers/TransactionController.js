const Joi = require("joi").extend(require("@joi/date"));
const client = require("../database/database");

const isCompanyExist = async (company) => {
  await client.connect();
  const collection = client.db("proyek_ws").collection("users");

  return await collection.findOne({
    username: company,
  });
};

const viewTransactionAdminSchema = Joi.object({
  company: Joi.string().optional(),
  start_date: Joi.date().format("YYYY-MM-DD").optional(),
  end_date: Joi.date()
    .format("YYYY-MM-DD")
    .min(Joi.ref("start_date"))
    .optional(),
});

const viewTransactionCompanySchema = Joi.object({
  start_date: Joi.date().format("YYYY-MM-DD").optional(),
  end_date: Joi.date()
    .format("YYYY-MM-DD")
    .min(Joi.ref("start_date"))
    .optional(),
});

const viewTransaction = async (req, res) => {
  const transCollection = client.db("proyek_ws").collection("transactions");
  const { company, start_date, end_date } = req.query;
  const { user } = req.body;

  if (
    (start_date != null && end_date == null) ||
    (start_date == null && end_date != null)
  ) {
    return res
      .status(400)
      .json({ message: "Both start date and end date must be provided" });
  }

  let where = {};
  if (req.body.user.role == "admin") {
    if (company != null) {
      if ((await isCompanyExist(company)) == null) {
        return res.status(400).json({
          message: "Company not found",
        });
      }
      where.username = company;
    }
  } else {
    where.username = req.body.user.username;
  }

  try {
    if (user.role == "company") {
      await viewTransactionCompanySchema.validateAsync({
        start_date,
        end_date,
      });
    } else {
      await viewTransactionAdminSchema.validateAsync({
        company,
        start_date,
        end_date,
      });
    }
  } catch (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  if (start_date && end_date) {
    where.datetime = {
      $gte: start_date + " 00:00",
      $lte: end_date + " 23:59",
    };
  }

  let project = { _id: 0, detail: 0, schedule_dates: 0 };
  if (req.body.user.role == "company") project.username = 0;
  let trans = await transCollection.find(where).project(project).toArray();

  if (trans.length == 0) {
    return res.json({ message: "No transactions occurred" });
  }

  let totalCharge = trans.reduce(
    (sum, item) => sum + parseFloat(item.charge),
    0
  );
  trans = trans.map((c) => {
    return {
      ...c,
      charge: `$${c.charge.toFixed(2)}`,
    };
  });
  return res.json({
    number_of_transaction: trans.length,
    total_charge: `$${totalCharge.toFixed(2)}`,
    transactions: trans,
  });
};

const viewTransactionDetail = async (req, res) => {
  const { transaction_id } = req.params;
  const { user } = req.body;
  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const transCollection = database.collection("transactions");
    const transaction = await transCollection.findOne({
      transaction_id: parseInt(transaction_id, 10),
    });
    delete transaction._id;
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    if (user.role === "company" && transaction.username !== user.username) {
      return res
        .status(403)
        .json({ message: "Access denied: unauthorized transaction access" });
    }
    return res.status(200).json(transaction);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  viewTransaction,
  viewTransactionDetail,
};
