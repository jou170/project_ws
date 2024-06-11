const express = require("express");
const router = require("./router/router");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();

app.use(express.json());

app.get("/", (req, res) => res.send("Hello World!"));

app.use("/api/v1", router);

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
