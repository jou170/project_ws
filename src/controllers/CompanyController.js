const Joi = require("joi").extend(require("@joi/date"));
const moment = require("moment");
const jwt = require("jsonwebtoken");
const client = require("../database/database");
const crypto = require("crypto");
const { default: axios } = require("axios");
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

    // Fetch public holidays from the Dayoff API
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
    let existingDays = [];

    // Fetch existing schedules for the company within the date range
    const existingSchedules = await collection
      .find({
        username,
        date: { $gte: start_date, $lte: end_date },
      })
      .toArray();

    const existingDates = existingSchedules.map((schedule) => schedule.date);

    for (
      let date = startDate.clone();
      date.isSameOrBefore(endDate);
      date.add(1, "days")
    ) {
      const day = date.format("dddd");
      const dateString = date.format("YYYY-MM-DD");

      const isWeekend = day === "Saturday" || day === "Sunday";
      const holiday = holidayDates.find((h) => h.date === dateString);
      const isAlreadyScheduled = existingDates.includes(dateString);

      if (!isWeekend && !holiday && !isAlreadyScheduled) {
        activeDays++;
      } else {
        if (isWeekend || holiday) {
          offDays.push({
            day,
            date: dateString,
            detail: holiday ? holiday.detail : "",
          });
        }
        if (isAlreadyScheduled) {
          existingDays.push(dateString);
        }
      }
    }

    if (activeDays === 0) {
      return res.status(400).json({
        message:
          "No schedules were created as all dates are either holidays, weekends, or already scheduled.",
      });
    }

    const charge = activeDays * 0.1;

    const companyCollection = database.collection("users");
    const company = await companyCollection.findOne({ username });

    if (company.balance < charge) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    let oldBalance = parseFloat(company.balance);
    let newBalance = oldBalance - charge;
    newBalance = parseFloat(newBalance.toFixed(2));

    await companyCollection.updateOne(
      { username },
      { $set: { balance: newBalance } }
    );

    let success_date = [];

    for (
      let date = startDate.clone();
      date.isSameOrBefore(endDate);
      date.add(1, "days")
    ) {
      const day = date.format("dddd");
      const dateString = date.format("YYYY-MM-DD");

      const isWeekend = day === "Saturday" || day === "Sunday";
      const holiday = holidayDates.find((h) => h.date === dateString);
      const isAlreadyScheduled = existingDates.includes(dateString);

      if (!isWeekend && !holiday && !isAlreadyScheduled) {
        await collection.insertOne({
          schedule_id: await getNextScheduleId(collection),
          username,
          date: dateString,
          day,
          attendance: [],
        });

        success_date.push(dateString);
      }
    }

    const transCollection = database.collection("transactions");

    let insertTrans = await transCollection.insertOne({
      username: username,
      type: "Create schedules",
      date: formateddate(),
      start_date: start_date,
      end_date: end_date,
      charge: charge.toFixed(2),
      number_of_schedules: activeDays,
      schedules: success_date
    })

    if (insertTrans.modifiedCount === 0) {
      return res.status(500).json({ message: "Failed to save transaction" })
    }

    return res.status(201).json({
      message: "Schedule created successfully",
      charge: `$${charge.toFixed(2)}`,
      number_of_active_day: `${activeDays} days`,
      active_days: success_date,
      off_days: offDays,
      existing_days: existingDays,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const getScheduleSchema = Joi.object({
  day: Joi.number().integer().min(1).max(31).optional(),
  month: Joi.number()
    .integer()
    .min(1)
    .max(12)
    .default(moment().month() + 1), //default bulan ini
  year: Joi.number().integer().min(2024).default(moment().year()), //default tahun ini
  limit: Joi.number()
    .integer()
    .min(1)
    .optional()
    .default(10)
    .when("offset", { is: Joi.exist(), then: Joi.required() }),
  offset: Joi.number().integer().min(1).optional(),
});

const getSchedule = async (req, res) => {
  const { day, month, year, limit, offset } = req.query;

  let user = req.body.user;
  let username;
  if (user.role == "company") {
    username = user.username;
  } else {
    username = user.company;
  }

  const { error } = getScheduleSchema.validate({
    day,
    month,
    year,
    limit,
    offset,
  });
  if (error) {
    return res.status(400).json({
      message: error.details.map((detail) => detail.message).join("; "),
    });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const scheduleCollection = database.collection("schedules");
    const userCollection = database.collection("users");

    // Calculate the start and end date for the query
    let startDate, endDate;
    if (day) {
      startDate = moment({ year, month: month - 1, day })
        .startOf("day")
        .format("YYYY-MM-DD");
      endDate = moment({ year, month: month - 1, day })
        .endOf("day")
        .format("YYYY-MM-DD");
    } else {
      startDate = moment({ year, month: month - 1 })
        .startOf("month")
        .format("YYYY-MM-DD");
      endDate = moment({ year, month: month - 1 })
        .endOf("month")
        .format("YYYY-MM-DD");
    }

    let schedules = [];


    // Fetch schedules for the specified date range

    schedules = await scheduleCollection
      .find({
        username,
        date: { $gte: startDate, $lte: endDate },
      }).project({
        _id: 0,
        username: 0
      })
      .toArray();


    // Apply pagination if limit and offset are provided
    if (limit && offset) {
      schedules = schedules.slice(limit * (offset - 1), limit * offset);
    } else if (limit) {
      schedules = schedules.slice(0, limit);
    }

    const company = await userCollection.findOne({ username });
    const employeeUsernames = company.employees || [];

    const employeeDetails = await userCollection
      .find({ username: { $in: employeeUsernames } })
      .toArray();

    if (user.roles == "company") {
      schedules = schedules.map((schedule) => {
        const attendanceSet = new Set(schedule.attendance);
        return {
          ...schedule,
          attendance: employeeDetails.map((employee) => ({
            username: employee.username,
            name: employee.name,
            attend: attendanceSet.has(employee.username),
          })),
        };
      });
    } else {
      schedules = schedules.map((schedule) => {
        const attendanceSet = new Set(schedule.attendance);
        return {
          ...schedule,
          attendance: attendanceSet.has(user.username),
        };
      });
    }

    return res.status(200).json({ schedules });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const deleteScheduleSchema = Joi.object({
  start_date: Joi.date().format("YYYY-MM-DD").required(),
  end_date: Joi.date()
    .format("YYYY-MM-DD")
    .min(Joi.ref("start_date"))
    .required(),
});

const deleteSchedule = async (req, res) => {
  const { start_date, end_date } = req.query;
  const username = req.body.user.username;

  const { error } = deleteScheduleSchema.validate({ start_date, end_date });
  if (error) {
    return res.status(400).json({
      message: error.details.map((detail) => detail.message).join("; "),
    });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("schedules");
    const companyCollection = database.collection("users");

    const existingSchedules = await collection
      .find({
        username,
        date: { $gte: start_date, $lte: end_date },
      })
      .toArray();

    if (existingSchedules.length === 0) {
      return res.status(404).json({
        message: "No schedules found within the specified date range",
      });
    }

    const deletedSchedules = existingSchedules.map((schedule) => schedule.date);
    await collection.deleteMany({
      username,
      date: { $gte: start_date, $lte: end_date },
    });

    const company = await companyCollection.findOne({ username });
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Deduct balance
    let charge = deletedSchedules.length * 0.1;
    charge = parseFloat(charge.toFixed(2));

    let newBalance = parseFloat(company.balance) - charge;
    newBalance = parseFloat(newBalance.toFixed(2));

    // Update the company's balance
    await companyCollection.updateOne(
      { username },
      { $set: { balance: newBalance } }
    );

    const transCollection = database.collection("transactions");
    const trans = await transCollection.insertOne({
      username: username,
      type: `Delete schedules`,
      date: formateddate(),
      charge: charge.toFixed(2),
      number_of_deleted_schedules: deletedSchedules.length,
      deleted_schedules: deletedSchedules,
    })

    if (trans.modifiedCount === 0) {
      return res.status(500).json({ message: "Failed to save the transactions" });
    }

    return res.status(200).json({
      message: "Schedules deleted successfully",
      deleted_schedules: deletedSchedules,
      charge: `$${charge.toFixed(2)}`,
    });
  } catch (err) {
    console.error(err);
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
    const trans = await transCollection.insertOne({
      username: username,
      type: `Upgrade plan type from ${req.body.user.plan_type} to ${plan_type}`,
      date: formateddate(),
      charge: cost.toFixed(2)
    })

    if (trans.modifiedCount === 0) {
      return res.status(500).json({ message: "Failed to save the transaction" });
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
  amount: Joi.number()
    .min(5)
    .max(1000)
    .required()
    .custom((value, helpers) => {
      // Check if value has more than two decimal places
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
