const Joi = require("joi").extend(require("@joi/date"));
const moment = require("moment");
const client = require("../database/database");
const { default: axios } = require("axios");
require("dotenv").config();

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const endOfYear = () => {
  const now = new Date();
  return new Date(now.getFullYear(), 11, 31);
};

function formateddate() {
  let date = new Date();
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const scheduleSchema = Joi.object({
  start_date: Joi.date()
    .iso()
    .min(formatDate(addDays(new Date(), 1)))
    .max(formatDate(endOfYear()))
    .required()
    .messages({
      "date.min": `start_date must be greater than or equal to ${formatDate(
        addDays(new Date(), 1)
      )}`,
      "date.max": `start_date must be less than or equal to ${formatDate(
        endOfYear()
      )}`,
      "date.base": `start_date must be a valid date`,
      "date.format": `start_date must be in the format YYYY-MM-DD`,
    }),
  end_date: Joi.date()
    .iso()
    .min(Joi.ref("start_date"))
    .max(formatDate(endOfYear()))
    .required()
    .messages({
      "date.min": `end_date must be greater than or equal to start_date`,
      "date.max": `end_date must be less than or equal to ${formatDate(
        endOfYear()
      )}`,
      "date.base": `start_date must be a valid date`,
      "date.format": `start_date must be in the format YYYY-MM-DD`,
    }),
});

const createSchedule = async (req, res) => {
  const { start_date, end_date } = req.body;
  const username = req.body.user.username;

  const { error } = scheduleSchema.validate({ start_date, end_date });
  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
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
    let existingDays = [];

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
          "No schedules were created as all dates are either holidays, weekends, or already scheduled",
      });
    }

    let charge = activeDays * 0.1;

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
          username,
          date: dateString,
          day,
          attendance: [],
        });

        success_date.push(dateString);
      }
    }

    const transCollection = database.collection("transactions");
    const latestTrans = await transCollection.findOne(
      {},
      { sort: { transaction_id: -1 } }
    );
    const newTransactionId = latestTrans ? latestTrans.transaction_id + 1 : 1;
    charge = parseFloat(charge.toFixed(2));

    let insertTrans = await transCollection.insertOne({
      transaction_id: newTransactionId,
      username: username,
      type: `Create schedules`,
      datetime: formateddate(),
      charge: charge,
      detail: `Schedules created from ${start_date} to ${end_date} with ${activeDays} active days`,
      schedule_dates: success_date,
    });

    if (insertTrans.insertedCount === 0) {
      return res.status(500).json({ message: "Failed to save transaction" });
    }

    return res.status(201).json({
      message: "Schedule created successfully",
      datetime: formateddate(),
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
  start_date: Joi.date().iso().optional().messages({
    "date.base": `start_date must be a valid date`,
    "date.format": `start_date must be in the format YYYY-MM-DD`,
  }),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).optional().messages({
    "date.base": `end_date must be a valid date`,
    "date.format": `end_date must be in the format YYYY-MM-DD`,
    "date.min": `end_date must be greater than or equal to start_date`,
  }),
  limit: Joi.number()
    .integer()
    .min(1)
    .optional()
    .default(10)
    .when("offset", { is: Joi.exist(), then: Joi.required() }),
  offset: Joi.number().integer().min(1).optional(),
}).custom((value, helpers) => {
  if (
    (value.start_date && !value.end_date) ||
    (!value.start_date && value.end_date)
  ) {
    return helpers.message(
      "Both start_date and end_date must be provided together, or neither"
    );
  }
  return value;
});

const getSchedule = async (req, res) => {
  const { start_date, end_date, offset } = req.query;
  let limit = req.query.limit;
  const user = req.body.user;
  const username = user.role == "company" ? user.username : user.company;

  const { error } = getScheduleSchema.validate({
    start_date,
    end_date,
    limit,
    offset,
  });
  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const scheduleCollection = database.collection("schedules");
    const userCollection = database.collection("users");

    if (username == "") {
      return res
        .status(400)
        .json({ message: "You are not associated with any company" });
    }

    let query = { username };
    if (start_date && end_date) {
      query.date = { $gte: start_date, $lte: end_date };
    }

    let schedules = await scheduleCollection
      .find(query)
      .sort({ date: 1 })
      .project({ _id: 0, username: 0 })
      .toArray();

    if (limit && offset) {
      schedules = schedules.slice(limit * (offset - 1), limit * offset);
    } else if (limit) {
      schedules = schedules.slice(0, limit);
    } else if (!limit) {
      limit = 10;
      schedules = schedules.slice(0, limit);
    }

    const company = await userCollection.findOne({ username });
    const employeeUsernames = company.employees || [];
    const employeeDetails = await userCollection
      .find({ username: { $in: employeeUsernames } })
      .toArray();

    if (user.role == "company") {
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
        const { attendance, ...rest } = schedule;
        return {
          ...rest,
          attend: attendanceSet.has(user.username),
        };
      });
    }

    if (schedules.length === 0) {
      return res
        .status(404)
        .json({ message: "No schedules found within the specified filter" });
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
  start_date: Joi.date().format("YYYY-MM-DD").required().messages({
    "date.base": `start_date must be a valid date`,
    "date.format": `start_date must be in the format YYYY-MM-DD`,
  }),
  end_date: Joi.date()
    .format("YYYY-MM-DD")
    .min(Joi.ref("start_date"))
    .required()
    .messages({
      "date.base": `end_date must be a valid date`,
      "date.format": `end_date must be in the format YYYY-MM-DD`,
      "date.min": `end_date must be greater than or equal to start_date`,
    }),
});

const deleteSchedule = async (req, res) => {
  const { start_date, end_date } = req.query;
  const username = req.body.user.username;

  const { error } = deleteScheduleSchema.validate({ start_date, end_date });
  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }
  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("schedules");
    const companyCollection = database.collection("users");
    const company = await companyCollection.findOne({ username });
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

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

    let charge = existingSchedules.length * 0.1;
    charge = parseFloat(charge.toFixed(2));

    if (company.balance < charge) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const deletedSchedules = existingSchedules.map((schedule) => schedule.date);
    await collection.deleteMany({
      username,
      date: { $gte: start_date, $lte: end_date },
    });

    let newBalance = parseFloat(company.balance) - charge;
    newBalance = parseFloat(newBalance.toFixed(2));

    await companyCollection.updateOne(
      { username },
      { $set: { balance: newBalance } }
    );

    const transCollection = database.collection("transactions");
    const latestTrans = await transCollection.findOne(
      {},
      { sort: { transaction_id: -1 } }
    );
    const newTransactionId = latestTrans ? latestTrans.transaction_id + 1 : 1;

    const trans = await transCollection.insertOne({
      transaction_id: await newTransactionId,
      username: username,
      type: `Delete schedules`,
      datetime: formateddate(),
      charge: charge,
      detail: `Schedules deleted from ${start_date} to ${end_date} with ${deletedSchedules.length} schedules affected`,
      schedule_dates: deletedSchedules,
    });

    if (trans.insertedId === 0) {
      return res
        .status(500)
        .json({ message: "Failed to save the transactions" });
    }

    return res.status(200).json({
      message: "Schedules deleted successfully",
      datetime: formateddate(),
      charge: `$${charge.toFixed(2)}`,
      deleted_schedules: deletedSchedules,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};
module.exports = {
  createSchedule,
  getSchedule,
  deleteSchedule,
};
