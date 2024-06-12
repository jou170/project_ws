require("dotenv").config();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const client = require("../database/database");

const validateAccessToken = async (req, res, next) => {
  const token = req.headers["authorization"];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const [part, accessToken] = token.split(" ");
  if (part !== "Bearer") {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    await client.connect();
    const database = client.db("proyek_ws");
    const collection = database.collection("users");

    const decoded = await jwt.verify(accessToken, process.env.JWT_SECRET);

    const user = await collection.findOne({ username: decoded.username });
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.body.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

const allowRoles = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const userRole = req.body.user.role;
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      next();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
};

module.exports = { validateAccessToken, allowRoles };
