require("dotenv").config();

const express = require("express");
const morgan = require("morgan");

const routes = require("./routes");

const app = express();
const PORT = process.env.PORT || 3001;

app.set("json spaces", 2);
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(routes);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
