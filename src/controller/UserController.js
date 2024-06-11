const Joi = require("joi");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const login = async (req, res) => {
  const { username, email, password } = req.body;

  const schema = Joi.object({
    username: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });

  const { error } = schema.validate({ username, email, password });
  // validate password

  // generate token
  const token = "";
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  return res.status(200).json({ message: "Login Success", token });
};
const register = async (req, res) => {
  const { username, email, password } = req.body;

  const schema = Joi.object({
    username: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });

  const { error } = schema.validate({ username, email, password });

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Save user to database
  // const user = new User({ username, email, password: hashedPassword });

  return res.status(200).json({ message: "Register Success" });
};
const viewUserProfile = async (req, res) => {};
const editUserProfile = async (req, res) => {};

module.exports = { login, register, viewUserProfile, editUserProfile };
