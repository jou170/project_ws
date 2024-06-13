const Joi = require("joi");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const client = require("../database/database");
const crypto = require("crypto");
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
  phone_number: Joi.string().pattern(/^\d+$/).required().messages({
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
      additionalProperties.company = {};
    } else if (role === "company") {
      additionalProperties.balance = 0.0;
      additionalProperties.invitation_code = await generateInvitationCode(
        collection
      );
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
      profile_picture: ".",
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
});

const editUserProfileData = async (req, res) => {
  const { name, phone_number, address } = req.body;
  const user = req.body.user;

  const { error } = editUserProfileSchema.validate({
    name,
    phone_number,
    address,
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
    const collection = database.collection("users");

    const updateFields = {};
    if (name) updateFields.name = name;
    if (phone_number) updateFields.phone_number = phone_number;
    if (address) updateFields.address = address;

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
const editUserProfilePicture = async (req, res) => {};

module.exports = {
  login,
  register,
  viewUserProfile,
  editUserProfileData,
  editUserProfilePicture,
};
