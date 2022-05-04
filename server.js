const express = require("express");
const bodyParser = require("body-parser");
const config = require("./config/config.js");
require("dotenv").config();

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

require("./routes/routes.js")(app);

app.listen(config.port);
//console.log(`Server started on port ${config.port}`);
