const Joi = require("joi");
const jwt = require("jsonwebtoken");
const client = require("../database/database");
require("dotenv").config();

const getCompanies = async (req, res) => {};
const getCompaniesByUsername = async (req, res) => {};
const getTopUpRequest = async (req, res) => {};
const editTopUpRequest = async (req, res) => {};

module.exports = {
  getCompanies,
  getCompaniesByUsername,
  getTopUpRequest,
  editTopUpRequest,
};
