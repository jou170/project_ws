const Joi = require("joi").extend(require("@joi/date"));
const moment = require("moment");
const jwt = require("jsonwebtoken");
const client = require("../database/database");
const crypto = require("crypto");
const { default: axios } = require("axios");
require("dotenv").config();

const getEmployeesSchema = Joi.object({
  name: Joi.string().optional(),
  limit: Joi.number().integer().min(1).optional().default(10),
  offset: Joi.number().integer().min(1).optional().default(0),
});

const getEmployees = async (req, res) => {
  const { name, limit, offset } = req.query;
  const user = req.body.user;

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
    const collection = database.collection("users");

    // Membangun query pencarian
    const query = {
      role: "employee",
      "company.username": user.username,
    };
    if (name) {
      query.name = new RegExp(name, "i"); // Pencarian nama yang mirip (case-insensitive)
    }

    const employees = await collection
      .find(query)
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .toArray();

    return res.status(200).json(employees);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const getEmployeesByUsername = async (req, res) => {};
const removeEmployeesFromCompany = async (req, res) => {};

const getNextScheduleId = async (collection) => {
  const lastSchedule = await collection
    .find()
    .sort({ schedule_id: -1 })
    .limit(1)
    .toArray();
  return lastSchedule.length > 0 ? lastSchedule[0].schedule_id + 1 : 1;
};

const scheduleSchema = Joi.object({
  start_date: Joi.date()
    .format("YYYY-MM-DD")
    .min(moment().add(1, "days").format("YYYY-MM-DD"))
    .max(moment().endOf("year").format("YYYY-MM-DD"))
    .required(),
  end_date: Joi.date()
    .format("YYYY-MM-DD")
    .min(Joi.ref("start_date"))
    .max(moment().endOf("year").format("YYYY-MM-DD"))
    .required(),
});

const createSchedule = async (req, res) => {
  const { start_date, end_date } = req.body;
  const username = req.body.user.username;

  // Validate the request body
  const { error } = scheduleSchema.validate({ start_date, end_date });
  if (error) {
    return res.status(400).json({
      message: error.details.map((detail) => detail.message).join("; "),
    });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("schedules");

    const response = await axios.get("https://dayoffapi.vercel.app/api", {
      params: { year: moment(start_date).year() },
    });
    const holidays = response.data;

    const holidayDates = holidays.map((holiday) => ({
      date: moment(holiday.tanggal, "YYYY-M-D").format("YYYY-MM-DD"),
      detail: holiday.keterangan,
      is_cuti: holiday.is_cuti,
    }));

    const startDate = moment(start_date);
    const endDate = moment(end_date);
    let activeDays = 0;
    let offDays = [];

    for (
      let date = startDate;
      date.isSameOrBefore(endDate);
      date.add(1, "days")
    ) {
      const day = date.format("dddd");
      const dateString = date.format("YYYY-MM-DD");

      const isWeekend = day === "Saturday" || day === "Sunday";
      const holiday = holidayDates.find((h) => h.date === dateString);

      if (!isWeekend && !holiday) {
        activeDays++;
        await collection.insertOne({
          schedule_id: await getNextScheduleId(collection),
          username,
          date: dateString,
          day,
          attendance: [],
        });
      } else {
        offDays.push({
          day,
          date: dateString,
          detail: holiday ? holiday.detail : "",
        });
      }
    }

    const charge = activeDays * 0.1;

    const companyCollection = database.collection("users");
    const company = await companyCollection.findOne({ username });

    if (company.balance < charge) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Deduct the charge from the company's balance
    await companyCollection.updateOne(
      { username },
      { $inc: { balance: -charge } }
    );

    return res.status(201).json({
      message: "Schedule created successfully",
      charge: `$${charge.toFixed(2)}`,
      active_day: `${activeDays} days`,
      off_day: offDays,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const getSchedule = async (req, res) => {};
const deleteSchedule = async (req, res) => {};

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
  createSchedule,
  getSchedule,
  deleteSchedule,
  upgradeCompanyPlanType,
  generateCompanyInvitationCode,
  companyTopUp,
};
