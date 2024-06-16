const Joi = require("joi").extend(require("@joi/date"));
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const client = require("../database/database");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { uploadPhoto } = require("../middleware/MulterMiddleware");

require("dotenv").config();

const loginSchema = Joi.object({
  username: Joi.string(),
  email: Joi.string().email(),
  password: Joi.string().required(),
})
  .or("username", "email")
  .xor("username", "email")
  .messages({
    "object.xor": 'Either "username" or "email" must be provided, but not both',
    "object.missing":
      'Either "username" or "email" must be provided, but not both',
  });

const login = async (req, res) => {
  const { username, email, password } = req.body;

  const { error } = loginSchema.validate(req.body);

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

    const user = await collection.findOne({ $or: [{ username }, { email }] });
    if (!user) {
      return res.status(404).json({ message: "Username or email not found" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(400).json({ message: "Wrong password" });
    }

    const token = jwt.sign(
      { username: user.username, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    return res.status(200).json({ message: "Login successful", token });
  } catch (err) {
    console.error(err);
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

const registerSchema = Joi.object({
  username: Joi.string().required(),
  email: Joi.string().email().required(),
  name: Joi.string().required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid("employee", "company").required(),
  phone_number: Joi.string().pattern(/^\d+$/).min(12).required().messages({
    "string.pattern.base": "phone_number must contain only digits",
  }),
  address: Joi.string().required(),
});

const register = async (req, res) => {
  const { username, email, name, password, role, phone_number, address } =
    req.body;

  const { error } = registerSchema.validate(req.body);

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

    const existingUser = await collection.findOne({
      $or: [{ username }, { email }],
    });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "username or email already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let additionalProperties = {};
    if (role === "employee") {
      additionalProperties.company = "";
    } else if (role === "company") {
      additionalProperties.balance = 0;
      additionalProperties.plan_type = "free";
      additionalProperties.invitation_code = await generateInvitationCode(
        collection
      );
      additionalProperties.plan_type = "free";
      additionalProperties.invitation_limit = 10;
      additionalProperties.employees = [];
    }

    const result = await collection.insertOne({
      username,
      email,
      name,
      password: hashedPassword,
      role,
      phone_number,
      address,
      profile_picture: "/uploads/default.png",
      ...additionalProperties,
    });

    const token = jwt.sign({ username, email, role }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    let message = "";
    if (role === "employee") {
      message = "Employee registration successful";
    } else if (role === "company") {
      message = "Company registration successful";
    }

    return res.status(201).json({ message, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const viewUserProfile = async (req, res) => {
  try {
    const user = req.body.user;

    delete user._id;
    delete user.password;
    delete user.role;
    return res.status(200).json(user);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const editUserProfileSchema = Joi.object({
  name: Joi.string().optional(),
  phone_number: Joi.string().pattern(/^\d+$/).optional().messages({
    "string.pattern.base": "phone_number must contain only digits",
  }),
  address: Joi.string().optional(),
  email: Joi.string().optional().email(),
});

const editUserProfileData = async (req, res) => {
  const { name, phone_number, address, email } = req.body;
  const user = req.body.user;

  await client.connect();
  const database = client.db("proyek_ws");
  const collection = database.collection("users");

  const { error } = editUserProfileSchema.validate({
    name,
    phone_number,
    address,
    email,
  });

  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message.replace(/"/g, ""))
      .join("; ");
    return res.status(400).json({ message: errorMessage });
  }

  if (email) {
    if (email == req.body.user.email) {
      return res.status(400).json({
        message: "The new email address cannot be the same as the previous one",
      });
    }

    const existingUser = await collection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }
  }

  try {
    const updateFields = {};
    if (name) updateFields.name = name;
    if (phone_number) updateFields.phone_number = phone_number;
    if (address) updateFields.address = address;
    if (email) updateFields.email = email;

    const filter = { username: user.username };

    const result = await collection.updateOne(filter, { $set: updateFields });

    if (result.modifiedCount === 0) {
      return res.status(200).json({ message: "No changes were made" });
    }

    let message = "";
    if (user.role === "company") {
      message = "Company profile update successful";
    } else if (user.role === "employee") {
      message = "Employee profile update successful";
    }

    return res.status(200).json({
      message,
      user: result.value,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  } finally {
    await client.close();
  }
};

const viewUserProfilePicture = async (req, res) => {
  return res.status(200).sendFile(req.body.user.profile_picture, { root: "." });
}

const editUserProfilePicture = async (req, res) => {
  let user = req.body.user;
  const upload = uploadPhoto(user.username).single("profile_picture");

  upload(req, res, async function (err) {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      await client.connect();
      const database = client.db("proyek_ws");
      const collection = database.collection("users");

      await collection.updateOne(
        { username: user.username },
        { $set: { profile_picture: `/uploads/${req.file.filename}` } }
      );
      return res.json({ message: "Update profile picture successfully." });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `Error : ${err}`,
      });
    }
  });
};

const deleteUserProfilePicture = async (req, res) => {

  const filename = req.body.user.profile_picture;
  if (filename.includes("default")) {
    return res.status(400).json({ message: "Profile picture has been deleted before" })
  }
  const filePath = "./" + filename;

  fs.unlink(filePath, async (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send({ error: err });
    }

    const database = client.db("proyek_ws");
    const collection = database.collection("users");

    try {
      await collection.updateOne(
        { username: req.body.user.username },
        { $set: { profile_picture: "/uploads/default.png" } }
      );

      return res.status(200).json({ message: "Delete Profile Picture Successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).send({ error: error.message });
    }
  });
};

const isCompanyExist = async (company) => {
  await client.connect();
  const collection = client.db("proyek_ws").collection("users");

  let comp = await collection.findOne({
    username: company
  })

  return comp;
}

const viewTransactionAdminSchema = Joi.object({
  start_date: Joi.date().format("YYYY-MM-DD").optional(),
  end_date: Joi.date().format("YYYY-MM-DD").optional(),
});

const viewTransaction = async (req, res) => {

  const transCollection = client.db("proyek_ws").collection("transactions");
  const { company, start_date, end_date } = req.query;

  
  if ((start_date && !end_date) || (!start_date && end_date)) {
    return res.status(400).json({ message: "Both start date and end date must be provided" })
  }

  if (req.body.user.role == "admin") {
    if (company && !isCompanyExist(company)) {
      return res.status(400).json({
        message: "Company not found"
      })
    }


  }

  try {
    await viewTransactionAdminSchema.validateAsync({ start_date, end_date });
  } catch (error) {
    let errorS = error.toString().split(": ")[1];
    return res.status(400).json({ message: errorS })
  }

}

module.exports = {
  login,
  register,
  viewUserProfile,
  editUserProfileData,
  viewUserProfilePicture,
  editUserProfilePicture,
  deleteUserProfilePicture,
  viewTransaction
};
