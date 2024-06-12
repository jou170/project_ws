const { MongoClient } = require("mongodb");
require("dotenv").config();
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { family: 4 });
module.exports = client;
