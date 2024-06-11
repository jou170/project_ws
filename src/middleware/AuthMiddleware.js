require("dotenv").config();
const jwt = require("jsonwebtoken");

const validateAccessToken = async (req, res, next) => {
  const token = req.headers["Authorization"];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const [part, accessToken] = token.split(" ");
  if (part !== "Bearer") {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const decoded = await jwt.verify(
      accessToken,
      process.env.ACCESS_TOKEN_SECRET
    );
    // get user from database
    // const user = {}
    // if(user does not exists) {
    //   return res.status(401).json({ message: "Unauthorized" });
    // }
    // req.user = user
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};
