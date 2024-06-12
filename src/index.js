const express = require("express");
const router = require("./router/router");
const client = require("./database/database");
const app = express();
const port = process.env.PORT;
require("dotenv").config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => res.send("Hello World!"));

app.use("/api/v1", router);

async function connectToDatabase() {
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas");
  } catch (err) {
    console.error(err);
  }
}
connectToDatabase();

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
